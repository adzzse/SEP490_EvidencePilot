package com.evidencepilot.service;

import com.evidencepilot.service.impl.AiModelClientImpl;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

class ExtractionBundleTest {

    @Test
    void rejectsDuplicateEntryNames() throws IOException {
        Path archive = writeArchive(List.of("images/a.jpg", "images/b.jpg"), List.of("images/a.jpg"));
        byte[] bytes = Files.readAllBytes(archive);
        replace(bytes, "images/b.jpg", "images/a.jpg");
        Files.write(archive, bytes);

        assertThatThrownBy(() -> ExtractionBundle.open(archive))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("duplicate");
    }

    @Test
    void rejectsUnsafeEntryName() throws IOException {
        Path archive = writeArchive(List.of("../escape.jpg"), List.of("../escape.jpg"));

        assertThatThrownBy(() -> ExtractionBundle.open(archive))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("unsafe");
    }

    @Test
    void rejectsImageNotListedByManifest() throws IOException {
        Path archive = writeArchive(List.of("images/extra.jpg"), List.of());

        assertThatThrownBy(() -> ExtractionBundle.open(archive))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("not listed");
    }

    @Test
    void rejectsListedImageThatIsMissing() throws IOException {
        Path archive = writeArchive(List.of(), List.of("images/missing.jpg"));

        assertThatThrownBy(() -> ExtractionBundle.open(archive))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("missing");
    }

    @Test
    void rejectsTooManyEntriesAndDeletesTheArchive() throws IOException {
        Path archive = writeArchive(
                IntStream.range(0, ExtractionBundle.MAX_IMAGE_COUNT + 1)
                        .mapToObj(index -> "images/zero-" + index + ".jpg")
                        .toList(),
                List.of());

        assertThatThrownBy(() -> ExtractionBundle.open(archive))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("too many entries");
        assertThat(Files.exists(archive)).isFalse();
    }

    @Test
    void rejectsImageWhoseContentSizeDiffersFromCentralDirectory() throws IOException {
        String image = "images/figure.jpg";
        Path archive = writeArchive(List.of(image), List.of(image), new byte[1024 * 1024]);
        patchCentralDirectorySize(archive, image, 1);

        assertThatThrownBy(() -> ExtractionBundle.open(archive))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("size");
        assertThat(Files.exists(archive)).isFalse();
    }

    @Test
    void copyWithLimitRejectsTheFirstByteBeyondTheLimit() {
        var source = new ByteArrayInputStream(new byte[11]);
        var target = new ByteArrayOutputStream();

        assertThatThrownBy(() -> AiModelClientImpl.copyWithLimit(source, target, 10))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("100 MiB");
    }

    private static Path writeArchive(List<String> entries, List<String> images) throws IOException {
        return writeArchive(entries, images, new byte[] {1});
    }

    private static Path writeArchive(List<String> entries, List<String> images, byte[] entryContent)
            throws IOException {
        Path archive = Files.createTempFile("extraction-bundle-test-", ".zip");
        try (var zip = new ZipOutputStream(Files.newOutputStream(archive), StandardCharsets.UTF_8)) {
            zip.putNextEntry(new ZipEntry("extraction.json"));
            zip.write(("{\"blocks\":[{\"type\":\"paragraph\",\"text\":\"Body\",\"level\":null,\"caption\":null}],\"images\":"
                    + images.stream().map(image -> "\"" + image + "\"")
                            .collect(Collectors.joining(",", "[", "]"))
                    + "}").getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("document.md"));
            zip.write("Body".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            for (String entry : entries) {
                zip.putNextEntry(new ZipEntry(entry));
                zip.write(entryContent);
                zip.closeEntry();
            }
        }
        return archive;
    }

    private static void patchCentralDirectorySize(Path archive, String entryName, int size)
            throws IOException {
        byte[] bytes = Files.readAllBytes(archive);
        byte[] name = entryName.getBytes(StandardCharsets.UTF_8);
        ByteBuffer data = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        for (int index = 0; index <= bytes.length - 46 - name.length; index++) {
            if (data.getInt(index) == 0x02014b50
                    && Short.toUnsignedInt(data.getShort(index + 28)) == name.length
                    && Arrays.equals(bytes, index + 46, index + 46 + name.length,
                            name, 0, name.length)) {
                data.putInt(index + 24, size);
                Files.write(archive, bytes);
                return;
            }
        }
        throw new AssertionError("Central directory entry not found: " + entryName);
    }

    private static void replace(byte[] bytes, String from, String to) {
        byte[] source = from.getBytes(StandardCharsets.UTF_8);
        byte[] target = to.getBytes(StandardCharsets.UTF_8);
        for (int index = 0; index <= bytes.length - source.length; index++) {
            boolean matches = true;
            for (int offset = 0; offset < source.length; offset++) {
                if (bytes[index + offset] != source[offset]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                System.arraycopy(target, 0, bytes, index, target.length);
            }
        }
    }
}
