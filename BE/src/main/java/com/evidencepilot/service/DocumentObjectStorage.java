package com.evidencepilot.service;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.errors.ErrorResponseException;
import io.minio.http.Method;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
public class DocumentObjectStorage {

    private final MinioClient minioClient;
    private final MinioClient minioPresignClient;

    public DocumentObjectStorage(
            @Qualifier("minioClient") MinioClient minioClient,
            @Qualifier("minioPresignClient") MinioClient minioPresignClient) {
        this.minioClient = minioClient;
        this.minioPresignClient = minioPresignClient;
    }

    @Value("${minio.bucket-name:evidence-pilot-bucket}")
    private String bucketName;

    @PostConstruct
    void ensureBucketExists() {
        try {
            boolean found = minioClient.bucketExists(
                    BucketExistsArgs.builder().bucket(bucketName).build());
            if (!found) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
                log.info("Created MinIO bucket: {}", bucketName);
            }
        } catch (Exception e) {
            log.warn("Could not verify/create MinIO bucket '{}': {}", bucketName, e.getMessage());
        }
    }

    public byte[] read(String objectKey) {
        try (var stream = minioClient.getObject(GetObjectArgs.builder()
                .bucket(bucketName)
                .object(objectKey)
                .build())) {
            return stream.readAllBytes();
        } catch (Exception e) {
            throw new DocumentStorageException("Failed to read object " + objectKey + " from MinIO", e);
        }
    }

    public String readText(String objectKey) {
        return new String(read(objectKey), StandardCharsets.UTF_8);
    }

    public void writeText(String objectKey, String text) {
        byte[] content = text.getBytes(StandardCharsets.UTF_8);
        try (var stream = new ByteArrayInputStream(content)) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucketName)
                    .object(objectKey)
                    .stream(stream, content.length, -1)
                    .contentType("text/markdown; charset=utf-8")
                    .build());
        } catch (Exception e) {
            throw new DocumentStorageException("Failed to write object " + objectKey + " to MinIO", e);
        }
    }

    public void write(String objectKey, InputStream stream, long size, String contentType) {
        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucketName)
                    .object(objectKey)
                    .stream(stream, size, -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception e) {
            throw new DocumentStorageException("Failed to write object " + objectKey + " to MinIO", e);
        }
    }

    public void write(String objectKey, byte[] data, String contentType) {
        write(objectKey, new ByteArrayInputStream(data), data.length, contentType);
    }

    public String writeWithSha256(String objectKey, InputStream stream, long size, String contentType) {
        MessageDigest digest = sha256();
        write(objectKey, new DigestInputStream(stream, digest), size, contentType);
        return HexFormat.of().formatHex(digest.digest());
    }

    public String writeWithSha256(String objectKey, byte[] data, String contentType) {
        write(objectKey, data, contentType);
        return HexFormat.of().formatHex(sha256().digest(data));
    }

    public void delete(String objectKey) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(bucketName)
                    .object(objectKey)
                    .build());
        } catch (Exception e) {
            throw new DocumentStorageException("Failed to delete object " + objectKey + " from MinIO", e);
        }
    }

    public static String extractionCheckpointKey(UUID documentId, String fileHashSha256) {
        String prefix = "documents/processed/" + documentId + "/";
        return fileHashSha256 == null || fileHashSha256.isBlank()
                ? prefix + "extraction.json"
                : prefix + fileHashSha256 + "/extraction.json";
    }

    public static String extractionCacheKey(String fileHashSha256) {
        if (fileHashSha256 == null
                || fileHashSha256.length() != 64
                || !fileHashSha256.chars().allMatch(character ->
                        character >= '0' && character <= '9'
                                || character >= 'a' && character <= 'f')) {
            throw new IllegalArgumentException("Extraction cache requires a lowercase SHA-256 hash");
        }
        return "documents/processed/cache/v1/sha256/" + fileHashSha256 + "/extraction.zip";
    }

    public void deleteExtractionCheckpoint(UUID documentId, String fileHashSha256) {
        String currentKey = extractionCheckpointKey(documentId, fileHashSha256);
        delete(currentKey);
        String legacyKey = extractionCheckpointKey(documentId, null);
        if (!legacyKey.equals(currentKey)) {
            delete(legacyKey);
        }
    }

    public InputStream getStream(String objectKey) {
        try {
            return minioClient.getObject(GetObjectArgs.builder()
                    .bucket(bucketName)
                    .object(objectKey)
                    .build());
        } catch (Exception e) {
            throw new DocumentStorageException("Failed to open stream for object " + objectKey, e);
        }
    }

    public boolean exists(String objectKey) {
        try {
            minioClient.statObject(StatObjectArgs.builder()
                    .bucket(bucketName)
                    .object(objectKey)
                    .build());
            return true;
        } catch (ErrorResponseException e) {
            if (e.response() != null && e.response().code() == 404) {
                return false;
            }
            throw new DocumentStorageException("Failed to inspect object " + objectKey + " in MinIO", e);
        } catch (Exception e) {
            throw new DocumentStorageException("Failed to inspect object " + objectKey + " in MinIO", e);
        }
    }

    public String presignedGetUrl(String objectKey, int expiryMinutes) {
        try {
            return minioPresignClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(bucketName)
                    .object(objectKey)
                    .expiry(expiryMinutes, TimeUnit.MINUTES)
                    .build());
        } catch (Exception e) {
            throw new DocumentStorageException("Failed to sign object " + objectKey + " in MinIO", e);
        }
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    public static class DocumentStorageException extends RuntimeException {
        public DocumentStorageException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
