package ec.ritmo;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
final class RitmoController {
    private final RitmoService service;

    RitmoController(RitmoService service) {
        this.service = service;
    }

    @GetMapping("/session")
    ResponseEntity<?> context(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session != null) {
            synchronized (session) {
                try {
                    return response(service.context(session));
                } catch (ApiException e) {
                    if (e.status != HttpStatus.UNAUTHORIZED) throw e;
                    session.invalidate();
                }
            }
        }
        return response(new RitmoService.Context(null, null, false, service.configured()));
    }

    @PostMapping("/session")
    ResponseEntity<?> session(@RequestBody JsonNode input, HttpServletRequest request) {
        requireSameOrigin(request);
        var session = request.getSession();
        synchronized (session) {
            switch (input.path("action").asText()) {
                case "logout" -> session.invalidate();
                case "demo" -> service.demo(session, input);
                case "login" -> {
                    service.login(session, input);
                    request.changeSessionId();
                }
                default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Acción no válida.");
            }
        }
        return response(Map.of("ok", true));
    }

    @PostMapping("/admin")
    ResponseEntity<?> admin(@RequestBody JsonNode input, HttpServletRequest request) {
        requireSameOrigin(request);
        HttpSession session = request.getSession(false);
        if (session == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Inicia sesión para continuar.");
        synchronized (session) {
            service.apply(session, input);
        }
        return response(Map.of("ok", true));
    }

    private void requireSameOrigin(HttpServletRequest request) {
        var fetchSite = request.getHeader("Sec-Fetch-Site");
        var origin = request.getHeader("Origin");
        var host = request.getHeader("Host");
        if ((fetchSite != null && !"same-origin".equals(fetchSite))
                || (origin != null && !origin.equals("http://" + host) && !origin.equals("https://" + host))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Origen de solicitud no autorizado.");
        }
    }

    private ResponseEntity<?> response(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<?> error(ApiException e) {
        return ResponseEntity.status(e.status).cacheControl(CacheControl.noStore()).body(Map.of("error", e.getMessage()));
    }
}
