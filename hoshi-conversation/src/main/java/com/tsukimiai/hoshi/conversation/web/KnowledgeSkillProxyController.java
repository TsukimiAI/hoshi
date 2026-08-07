package com.tsukimiai.hoshi.conversation.web;

import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.conversation.config.KnowledgeSkillProperties;
import com.tsukimiai.hoshi.user.entity.User;
import java.io.IOException;
import java.net.Proxy;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
@RequestMapping("/api/v1/skills/knowledge")
public class KnowledgeSkillProxyController {

    private static final String DEFAULT_SKILL_BASE_URL = "http://localhost:8090";
    private static final String SKILL_UNAVAILABLE_MESSAGE =
            "知识库服务不可用，请确认 hoshi-skill 已启动（默认 http://localhost:8090）";

    private final RestClient restClient;
    private final RestClient uploadRestClient;
    private final String skillBaseUrl;
    private final CurrentUserResolver currentUserResolver;

    @Autowired
    public KnowledgeSkillProxyController(
            KnowledgeSkillProperties properties, CurrentUserResolver currentUserResolver) {
        this(properties, currentUserResolver, null, null);
    }

    KnowledgeSkillProxyController(
            KnowledgeSkillProperties properties,
            CurrentUserResolver currentUserResolver,
            RestClient restClient,
            RestClient uploadRestClient) {
        this.skillBaseUrl = properties.getResolvedBaseUrl();
        this.currentUserResolver = currentUserResolver;
        int timeoutMs = Math.max(properties.getTimeoutMs(), 1000);
        int uploadTimeoutMs = Math.max(properties.getUploadTimeoutMs(), timeoutMs);
        this.restClient = restClient != null ? restClient : buildRestClient(timeoutMs);
        this.uploadRestClient = uploadRestClient != null ? uploadRestClient : buildRestClient(uploadTimeoutMs);
    }

    @GetMapping("/documents")
    public ApiResponse<List<Map<String, Object>>> listDocuments(
            @RequestParam(value = "limit", defaultValue = "50") int limit) {
        Long userId = requireUserId();
        String url = UriComponentsBuilder.fromUriString(skillBaseUrl)
                .path("/v1/skills/knowledge/documents")
                .queryParam("userId", userId)
                .queryParam("limit", limit)
                .build()
                .toUriString();
        return forwardGet(url, new ParameterizedTypeReference<ApiResponse<List<Map<String, Object>>>>() {}, List.of());
    }

    @PostMapping(value = "/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<Map<String, Object>> uploadDocument(@RequestPart("file") MultipartFile file) throws IOException {
        Long userId = requireUserId();
        String url = UriComponentsBuilder.fromUriString(skillBaseUrl)
                .path("/v1/skills/knowledge/documents")
                .queryParam("userId", userId)
                .build()
                .toUriString();
        MultipartBodyBuilder bodyBuilder = new MultipartBodyBuilder();
        bodyBuilder.part("file", toFileResource(file));
        return forwardMultipart(url, bodyBuilder.build(), new ParameterizedTypeReference<ApiResponse<Map<String, Object>>>() {});
    }

    @DeleteMapping("/documents/{id}")
    public ApiResponse<Void> deleteDocument(@PathVariable("id") Long id) {
        Long userId = requireUserId();
        String url = UriComponentsBuilder.fromUriString(skillBaseUrl)
                .path("/v1/skills/knowledge/documents/{id}")
                .queryParam("userId", userId)
                .buildAndExpand(id)
                .toUriString();
        try {
            ApiResponse<Void> skillResponse = restClient.delete()
                    .uri(url)
                    .retrieve()
                    .body(new ParameterizedTypeReference<ApiResponse<Void>>() {});
            if (skillResponse == null) {
                return unavailableVoid();
            }
            if (skillResponse.code() != 0) {
                return new ApiResponse<>(skillResponse.code(), skillResponse.message(), null);
            }
            return ApiResponse.ok();
        } catch (Exception ex) {
            return unavailableVoid();
        }
    }

    private Long requireUserId() {
        User user = currentUserResolver.requireCurrentUser();
        return user.getId();
    }

    private <T> ApiResponse<T> forwardGet(String url, ParameterizedTypeReference<ApiResponse<T>> type, T emptyData) {
        try {
            ApiResponse<T> skillResponse = restClient.get()
                    .uri(url)
                    .retrieve()
                    .body(type);
            return unwrapSkillResponse(skillResponse, emptyData);
        } catch (Exception ex) {
            return unavailable(emptyData);
        }
    }

    private <T> ApiResponse<T> forwardMultipart(
            String url,
            MultiValueMap<String, org.springframework.http.HttpEntity<?>> body,
            ParameterizedTypeReference<ApiResponse<T>> type) {
        try {
            ApiResponse<T> skillResponse = uploadRestClient.post()
                    .uri(url)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(type);
            return unwrapSkillResponse(skillResponse, null);
        } catch (Exception ex) {
            return unavailable(null);
        }
    }

    private <T> ApiResponse<T> unwrapSkillResponse(ApiResponse<T> skillResponse, T emptyData) {
        if (skillResponse == null) {
            return ApiResponse.ok(emptyData);
        }
        if (skillResponse.code() != 0) {
            return new ApiResponse<>(skillResponse.code(), skillResponse.message(), skillResponse.data());
        }
        T data = skillResponse.data() == null ? emptyData : skillResponse.data();
        return ApiResponse.ok(data);
    }

    private <T> ApiResponse<T> unavailable(T emptyData) {
        return new ApiResponse<>(50300, SKILL_UNAVAILABLE_MESSAGE, emptyData);
    }

    private ApiResponse<Void> unavailableVoid() {
        return new ApiResponse<>(50300, SKILL_UNAVAILABLE_MESSAGE, null);
    }

    private ByteArrayResource toFileResource(MultipartFile file) throws IOException {
        String filename = file.getOriginalFilename();
        byte[] bytes = file.getBytes();
        return new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    private RestClient buildRestClient(int timeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setProxy(Proxy.NO_PROXY);
        requestFactory.setConnectTimeout(Duration.ofMillis(timeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(timeoutMs));
        return RestClient.builder()
                .requestFactory(requestFactory)
                .build();
    }

    static String resolveSkillBaseUrl(String configured) {
        if (configured == null || configured.isBlank()) {
            return DEFAULT_SKILL_BASE_URL;
        }
        String normalized = configured.strip();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }
}
