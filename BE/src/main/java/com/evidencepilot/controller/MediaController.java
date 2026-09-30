package com.evidencepilot.controller;

import com.evidencepilot.dto.response.ProjectMediaResponse;
import com.evidencepilot.service.MediaAssetService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/media")
@RequiredArgsConstructor
@Tag(name = "Media Assets", description = "Upload, list, and delete project media assets (images, figures)")
public class MediaController {

    private final MediaAssetService mediaAssetService;

    @Operation(summary = "Upload a media asset")
    @ApiResponse(responseCode = "201", description = "Media uploaded")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ProjectMediaResponse> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam("projectId") UUID projectId,
            @RequestParam(value = "paperId", required = false) UUID paperId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(mediaAssetService.upload(file, projectId, paperId));
    }

    @Operation(summary = "List media assets by project")
    @GetMapping("/projects/{projectId}")
    public List<ProjectMediaResponse> listByProject(@PathVariable UUID projectId) {
        return mediaAssetService.listByProject(projectId);
    }

    @Operation(summary = "List media assets for a paper")
    @GetMapping("/papers/{paperId}")
    public List<ProjectMediaResponse> listByPaper(@PathVariable UUID paperId) {
        return mediaAssetService.listByPaper(paperId);
    }

    @Operation(summary = "Get pre-signed download URL for a media asset")
    @GetMapping("/{id}/url")
    public Map<String, String> getSignedUrl(@PathVariable UUID id) {
        return Map.of("url", mediaAssetService.getSignedUrl(id));
    }

    @Operation(summary = "Get pre-signed download URLs for many media assets at once")
    @PostMapping("/urls")
    public Map<String, String> getSignedUrls(@RequestBody MediaUrlsRequest request) {
        return mediaAssetService.getSignedUrls(request.ids()).entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(
                        e -> e.getKey().toString(),
                        Map.Entry::getValue));
    }

    public record MediaUrlsRequest(List<UUID> ids) {
    }

    @Operation(summary = "Delete a media asset")
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        mediaAssetService.delete(id);
    }
}
