package com.evidencepilot.service;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public final class ExtractionBundle implements AutoCloseable {
    static final long MAX_ARCHIVE_BYTES = 100L * 1024 * 1024;
    static final long MAX_TEXT_ENTRY_BYTES = 20L * 1024 * 1024;
    static final long MAX_UNCOMPRESSED_BYTES = 200L * 1024 * 1024;
    static final int MAX_IMAGE_COUNT = 1_000;

    private final Path archivePath;
    private final ZipFile archive;
    private final AiModelClient.ExtractedDocument document;
    private final Map<String, ZipEntry> images;
    private final Map<String, Long> imageSizes;

    private ExtractionBundle(Path archivePath, ZipFile archive,
            AiModelClient.ExtractedDocument document, Map<String, ZipEntry> images,
            Map<String, Long> imageSizes) {
        this.archivePath = archivePath;
        this.archive = archive;
        this.document = document;
        this.images = images;
        this.imageSizes = imageSizes;
    }

    public static ExtractionBundle open(Path archivePath) throws IOException {
        return open(archivePath, new ObjectMapper());
    }

    public static ExtractionBundle open(InputStream content) throws IOException {
        Path archivePath = Files.createTempFile("extraction-bundle-", ".zip");
        try (var output = Files.newOutputStream(archivePath)) {
            byte[] buffer = new byte[64 * 1024];
            long copied = 0;
            int read;
            while ((read = content.read(buffer)) >= 0) {
                copied += read;
                if (copied > MAX_ARCHIVE_BYTES) {
                    throw new IOException("Extraction bundle exceeds the 100 MiB archive limit");
                }
                output.write(buffer, 0, read);
            }
        } catch (IOException | RuntimeException e) {
            delete(archivePath);
            throw e;
        }
        return open(archivePath);
    }

    static ExtractionBundle open(Path archivePath, ObjectMapper objectMapper) throws IOException {
        ZipFile archive;
        try {
            archive = new ZipFile(archivePath.toFile(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            delete(archivePath);
            throw e;
        }
        try {
            Map<String, ZipEntry> entries = new HashMap<>();
            long uncompressedBytes = 0;
            int fileEntries = 0;
            Enumeration<? extends ZipEntry> iterator = archive.entries();
            while (iterator.hasMoreElements()) {
                ZipEntry entry = iterator.nextElement();
                String name = entry.getName();
                if (entry.isDirectory() || !validEntryPath(name)) {
                    throw new IOException("Extraction bundle has an unsafe entry: " + name);
                }
                if (++fileEntries > MAX_IMAGE_COUNT + 2) {
                    throw new IOException("Extraction bundle has too many entries");
                }
                if (entries.putIfAbsent(name, entry) != null) {
                    throw new IOException("Extraction bundle has a duplicate entry: " + name);
                }
                if (entry.getSize() < 0) {
                    throw new IOException("Extraction bundle entry size is unavailable: " + name);
                }
                uncompressedBytes += entry.getSize();
                if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
                    throw new IOException("Extraction bundle exceeds the 200 MiB uncompressed limit");
                }
            }
            ZipEntry manifestEntry = entries.get("extraction.json");
            ZipEntry markdownEntry = entries.get("document.md");
            if (manifestEntry == null || markdownEntry == null) {
                throw new IOException("Extraction bundle is missing extraction.json or document.md");
            }
            Map<String, Long> measuredSizes = new HashMap<>();
            byte[] buffer = new byte[64 * 1024];
            long measuredUncompressedBytes = 0;
            for (ZipEntry entry : entries.values()) {
                long measuredSize = 0;
                try (InputStream input = archive.getInputStream(entry)) {
                    int read;
                    while ((read = input.read(
                            buffer,
                            0,
                            (int) Math.min(
                                    buffer.length,
                                    MAX_UNCOMPRESSED_BYTES - measuredUncompressedBytes + 1))) >= 0) {
                        measuredSize += read;
                        measuredUncompressedBytes += read;
                        if (measuredUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
                            throw new IOException(
                                    "Extraction bundle exceeds the 200 MiB uncompressed limit");
                        }
                    }
                }
                if (measuredSize != entry.getSize()) {
                    throw new IOException(
                            "Extraction bundle entry size does not match its content: "
                                    + entry.getName());
                }
                measuredSizes.put(entry.getName(), measuredSize);
            }
            Manifest manifest = objectMapper.readValue(
                    readEntry(archive, manifestEntry, MAX_TEXT_ENTRY_BYTES), Manifest.class);
            if (manifest == null || manifest.blocks() == null || manifest.images() == null) {
                throw new IOException("Extraction bundle manifest is invalid");
            }
            if (manifest.images().size() > MAX_IMAGE_COUNT) {
                throw new IOException("Extraction bundle has too many images");
            }
            AiModelClient.ExtractedDocument document;
            try {
                document = new AiModelClient.ExtractedDocument(
                        new String(readEntry(archive, markdownEntry, MAX_TEXT_ENTRY_BYTES), StandardCharsets.UTF_8),
                        List.copyOf(manifest.blocks()),
                        List.copyOf(manifest.images()));
            } catch (RuntimeException e) {
                throw new IOException("Extraction bundle manifest is invalid", e);
            }
            if (!document.valid()) {
                throw new IOException("Extraction bundle manifest is invalid");
            }
            Set<String> expected = new HashSet<>(document.images());
            expected.add("extraction.json");
            expected.add("document.md");
            for (String name : entries.keySet()) {
                if (!expected.contains(name)) {
                    throw new IOException("Extraction bundle entry is not listed by the manifest: " + name);
                }
            }
            for (String path : document.images()) {
                if (!entries.containsKey(path)) {
                    throw new IOException("Extraction bundle image is missing: " + path);
                }
            }
            Map<String, ZipEntry> images = new HashMap<>();
            Map<String, Long> imageSizes = new HashMap<>();
            for (String path : document.images()) {
                images.put(path, entries.get(path));
                imageSizes.put(path, measuredSizes.get(path));
            }
            return new ExtractionBundle(
                    archivePath,
                    archive,
                    document,
                    Map.copyOf(images),
                    Map.copyOf(imageSizes));
        } catch (IOException | RuntimeException e) {
            try {
                archive.close();
            } catch (IOException ignored) {
            }
            delete(archivePath);
            if (e instanceof IOException ioException) {
                throw ioException;
            }
            throw new IOException("Extraction bundle is invalid", e);
        }
    }

    public AiModelClient.ExtractedDocument document() {
        return document;
    }

    public InputStream openArchive() throws IOException {
        return Files.newInputStream(archivePath);
    }

    public long archiveSize() throws IOException {
        return Files.size(archivePath);
    }

    public InputStream openImage(String path) throws IOException {
        ZipEntry entry = images.get(path);
        if (entry == null) {
            throw new IOException("Extraction image is not present: " + path);
        }
        return archive.getInputStream(entry);
    }

    public long imageSize(String path) throws IOException {
        Long size = imageSizes.get(path);
        if (size == null) {
            throw new IOException("Extraction image size is unavailable: " + path);
        }
        return size;
    }

    public String imageMediaType(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        return "image/jpeg";
    }

    public static boolean validImagePath(String path) {
        return validTexImagePath(path) && path.startsWith("images/") && path.length() > "images/".length();
    }

    public static boolean validTexImagePath(String path) {
        if (!validEntryPath(path)) {
            return false;
        }
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".png") || lower.endsWith(".webp");
    }

    private static boolean validEntryPath(String path) {
        if (path == null || path.isBlank() || path.startsWith("/")
                || path.contains("\\") || path.contains(":") || path.contains("\0")) {
            return false;
        }
        Path normalized = Path.of(path).normalize();
        return !normalized.isAbsolute() && !normalized.startsWith("..")
                && normalized.toString().replace('\\', '/').equals(path);
    }

    private static byte[] readEntry(ZipFile archive, ZipEntry entry, long maxBytes) throws IOException {
        if (entry.getSize() < 0 || entry.getSize() > maxBytes) {
            throw new IOException("Extraction text entry exceeds its limit");
        }
        try (InputStream input = archive.getInputStream(entry)) {
            byte[] data = input.readNBytes(Math.toIntExact(maxBytes + 1));
            if (data.length > maxBytes) {
                throw new IOException("Extraction text entry exceeds its limit");
            }
            return data;
        }
    }

    private static void delete(Path archivePath) {
        try {
            Files.deleteIfExists(archivePath);
        } catch (IOException ignored) {
        }
    }

    @Override
    public void close() {
        try {
            archive.close();
        } catch (IOException ignored) {
        } finally {
            delete(archivePath);
        }
    }

    private record Manifest(List<AiModelClient.ExtractionBlock> blocks, List<String> images) {
    }
}
