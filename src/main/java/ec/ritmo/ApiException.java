package ec.ritmo;

import org.springframework.http.HttpStatus;

final class ApiException extends RuntimeException {
    final HttpStatus status;

    ApiException(String message) {
        this(HttpStatus.UNPROCESSABLE_ENTITY, message);
    }

    ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }
}
