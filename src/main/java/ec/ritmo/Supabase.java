package ec.ritmo;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Repository;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

@Repository
final class Supabase {
    private final RestClient client;
    private final boolean configured;

    Supabase(Environment env, RestClient.Builder builder) {
        var url = env.getProperty("SUPABASE_URL", "");
        var key = env.getProperty("SUPABASE_PUBLISHABLE_KEY", "");
        if (key.isBlank()) key = env.getProperty("SUPABASE_ANON_KEY", "");
        configured = !url.isBlank() && !key.isBlank();
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8)).build());
        factory.setReadTimeout(Duration.ofSeconds(15));
        client = builder.baseUrl(url.replaceFirst("/$", "")).defaultHeader("apikey", key)
                .requestFactory(factory).build();
    }

    boolean configured() {
        return configured;
    }

    JsonNode login(String email, String password) {
        return request(HttpMethod.POST, "/auth/v1/token?grant_type=password", null,
                Map.of("email", email, "password", password));
    }

    JsonNode refresh(String refreshToken) {
        return request(HttpMethod.POST, "/auth/v1/token?grant_type=refresh_token", null,
                Map.of("refresh_token", refreshToken));
    }

    JsonNode request(HttpMethod method, String path, String token, Object body) {
        if (!configured) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Supabase no está configurado.");
        var request = client.method(method).uri(path);
        if (token != null) request.headers(headers -> headers.setBearerAuth(token));
        if (body != null) request.contentType(MediaType.APPLICATION_JSON).body(body);
        try {
            return request.retrieve().body(JsonNode.class);
        } catch (RestClientResponseException e) {
            var data = e.getResponseBodyAs(JsonNode.class);
            var message = data == null ? "No se pudo completar la operación."
                    : data.path("message").asText(data.path("msg").asText("No se pudo completar la operación."));
            var code = data == null ? "" : data.path("code").asText();
            var authCode = data == null ? "" : data.path("error_code").asText();
            if (e.getStatusCode().value() == 401 || "bad_jwt".equals(authCode)
                    || "PGRST301".equals(code) || (token != null && message.startsWith("invalid JWT"))) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "La sesión ha caducado. Inicia sesión nuevamente.");
            }
            if (e.getStatusCode().is5xxServerError())
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Supabase no pudo procesar la solicitud.");
            throw new ApiException(message);
        } catch (ResourceAccessException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "No se pudo conectar a Supabase.");
        }
    }
}
