package ec.ritmo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
final class RitmoService {
    static final List<String> RECORDS = List.of("ejercicios", "alimentos", "suenos", "mediciones", "sustancias");
    static final List<String> TABLES = List.of("usuarios", "metas", "indicadores", "mediciones",
            "ejercicios", "alimentos", "suenos", "sustancias");

    record Context(JsonNode user, ObjectNode state, boolean demo, boolean configured) {}
    private record Login(String access, String refresh, String userId) {}

    private final Supabase db;
    private final ObjectMapper json;
    private final Commands commands;

    RitmoService(Supabase db, ObjectMapper json, Commands commands) {
        this.db = db;
        this.json = json;
        this.commands = commands;
    }

    boolean configured() {
        return db.configured();
    }

    void login(HttpSession session, JsonNode input) {
        String email = input.path("email").asText("").trim();
        String password = input.path("password").asText("");
        if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") || email.length() > 254
                || password.isEmpty() || password.length() > 200) {
            throw new ApiException("Ingresa un correo y una contraseña válidos.");
        }
        Login login;
        try {
            login = tokens(db.login(email, password));
        } catch (ApiException e) {
            if (e.status.is5xxServerError()) throw e;
            throw new ApiException(HttpStatus.UNAUTHORIZED, "No se pudo iniciar sesión. Revisa tus credenciales.");
        }
        session.removeAttribute("demo");
        session.removeAttribute("role");
        session.setAttribute("login", login);
    }

    void demo(HttpSession session, JsonNode input) {
        if (configured()) throw new ApiException(HttpStatus.FORBIDDEN, "Usa una cuenta para iniciar sesión.");
        String role = input.path("role").asText("cliente");
        if (!List.of("cliente", "entrenador").contains(role)) throw new ApiException("Perfil inválido.");
        if (session.getAttribute("demo") == null || input.path("reset").asBoolean()) {
            session.setAttribute("demo", seed());
        }
        session.setAttribute("role", role);
        session.removeAttribute("login");
    }

    Context context(HttpSession session) {
        if (session.getAttribute("demo") instanceof ObjectNode state) {
            var user = rows(state, "usuarios").stream()
                    .filter(row -> row.path("role").asText().equals(session.getAttribute("role")))
                    .findFirst().orElseThrow();
            return contextFor(state, user, true);
        }
        var login = access(session);
        var state = json.createObjectNode();
        for (var table : TABLES) {
            state.set(table, db.request(HttpMethod.GET, "/rest/v1/" + table + "?select=*&limit=10000", login.access, null));
        }
        var user = find(state, "usuarios", login.userId);
        if (user == null) throw new ApiException(HttpStatus.FORBIDDEN, "Tu cuenta no tiene un perfil configurado.");
        return contextFor(state, user, false);
    }

    private Context contextFor(ObjectNode state, JsonNode user, boolean demo) {
        var scoped = json.createObjectNode();
        TABLES.forEach(scoped::putArray);
        String id = user.path("id").asText();
        boolean trainer = user.path("role").asText().equals("entrenador");
        for (var row : rows(state, "usuarios")) {
            if (id.equals(row.path("id").asText()) || (trainer
                    ? id.equals(row.path("trainer_id").asText())
                    : row.path("id").asText().equals(user.path("trainer_id").asText()))) {
                array(scoped, "usuarios").add(row);
            }
        }
        for (var row : rows(state, "metas")) {
            var client = row.path("client_id").asText();
            if (id.equals(client) || (trainer && find(scoped, "usuarios", client) != null)) array(scoped, "metas").add(row);
        }
        for (var table : TABLES.subList(2, TABLES.size())) {
            for (var row : rows(state, table)) {
                if (find(scoped, "metas", row.path("meta_id").asText()) != null) array(scoped, table).add(row);
            }
        }
        return new Context(user, scoped, demo, configured());
    }

    void apply(HttpSession session, JsonNode input) {
        var context = context(session);
        var change = commands.prepare(input, context.user, context.state);
        if (context.demo) {
            var state = (ObjectNode) session.getAttribute("demo");
            var array = array(state, change.table());
            if (change.existing()) {
                for (int i = 0; i < array.size(); i++) {
                    if (!array.get(i).path("id").asText().equals(change.id())) continue;
                    if (change.row() == null) array.remove(i);
                    else array.set(i, change.row());
                    break;
                }
            } else {
                array.add(change.row());
            }
            if (change.indicators() != null) array(state, "indicadores").addAll(change.indicators());
            return;
        }
        var token = ((Login) session.getAttribute("login")).access;
        if (change.indicators() != null) {
            db.request(HttpMethod.POST, "/rest/v1/rpc/activar_meta", token,
                    Map.of("p_meta", change.row(), "p_indicadores", change.indicators()));
            return;
        }
        var method = change.row() == null ? HttpMethod.DELETE : change.existing() ? HttpMethod.PATCH : HttpMethod.POST;
        var path = "/rest/v1/" + change.table() + (change.existing() ? "?id=eq." + change.id() : "");
        db.request(method, path, token, change.row());
    }

    private Login access(HttpSession session) {
        if (!(session.getAttribute("login") instanceof Login login)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Inicia sesión para continuar.");
        }
        try {
            db.request(HttpMethod.GET, "/auth/v1/user", login.access, null);
            return login;
        } catch (ApiException e) {
            if (e.status != HttpStatus.UNAUTHORIZED) throw e;
        }
        try {
            var refreshed = tokens(db.refresh(login.refresh));
            session.setAttribute("login", refreshed);
            return refreshed;
        } catch (ApiException e) {
            if (e.status.is5xxServerError()) throw e;
            throw new ApiException(HttpStatus.UNAUTHORIZED, "La sesión ha caducado. Inicia sesión nuevamente.");
        }
    }

    private static Login tokens(JsonNode data) {
        return new Login(data.path("access_token").asText(), data.path("refresh_token").asText(),
                data.path("user").path("id").asText());
    }

    static List<JsonNode> rows(ObjectNode state, String table) {
        var rows = new java.util.ArrayList<JsonNode>();
        state.path(table).forEach(rows::add);
        return rows;
    }

    static JsonNode find(ObjectNode state, String table, String id) {
        return rows(state, table).stream().filter(row -> row.path("id").asText().equals(id)).findFirst().orElse(null);
    }

    private static ArrayNode array(ObjectNode state, String table) {
        return (ArrayNode) state.get(table);
    }

    private ObjectNode seed() {
        var state = json.createObjectNode();
        TABLES.forEach(state::putArray);
        var today = LocalDate.now(ZoneId.of("America/Guayaquil"));
        var start = today.with(java.time.DayOfWeek.MONDAY).minusWeeks(1);
        var trainer = "11111111-1111-4111-8111-111111111111";
        var client = "22222222-2222-4222-8222-222222222222";
        var other = "33333333-3333-4333-8333-333333333333";
        var goal = "44444444-4444-4444-8444-444444444444";
        var indicator = "55555555-5555-4555-8555-555555555555";
        array(state, "usuarios").addObject().put("id", trainer).put("role", "entrenador")
                .put("name", "Daniela Torres").putNull("trainer_id").put("timezone", "America/Guayaquil");
        array(state, "usuarios").addObject().put("id", client).put("role", "cliente")
                .put("name", "Miguel Andrés Punin").put("trainer_id", trainer).put("timezone", "America/Guayaquil");
        array(state, "usuarios").addObject().put("id", other).put("role", "cliente")
                .put("name", "Sofía Andrade").put("trainer_id", trainer).put("timezone", "America/Guayaquil");
        array(state, "metas").addObject().put("id", goal).put("client_id", client).put("type", "MEJORAR_FUERZA")
                .put("status", "activa").put("start_date", start.toString()).put("end_date", start.plusDays(55).toString())
                .put("exercise_days", 4).put("food_days", 6).put("sleep_days", 5).put("sleep_min", 7).put("sleep_max", 9)
                .put("observation", "Buen comienzo. Mantén la técnica en cada repetición.")
                .put("observation_author", trainer).put("observation_at", Instant.now().toString());
        array(state, "indicadores").addObject().put("id", indicator).put("meta_id", goal).put("kind", "FUERZA")
                .put("name", "Press de banca").put("unit", "kg").put("initial", 20).put("target", 30)
                .put("exercise", "Press de banca").put("technique", "Barra al pecho, recorrido completo")
                .put("equipment", "Barra olímpica").put("reps", 10);
        for (int n = 0; n < 10 && !start.plusDays(n).isAfter(today); n++) {
            var date = start.plusDays(n);
            if (n % 3 != 2) demoRecord(state, "ejercicios", goal, date).put("name", "Press de banca")
                    .put("time", "18:00").put("series", 3).put("reps", 10).put("weight", 20 + n * .5).put("performed", true);
            demoRecord(state, "alimentos", goal, date).put("kind", "declaracion").put("complete", n % 5 != 4).put("meal", "");
            if (n != 3) demoRecord(state, "suenos", goal, date).put("start", date.minusDays(1) + "T23:00:00-05:00")
                    .put("end", date + (n % 4 == 0 ? "T06:00:00-05:00" : "T07:00:00-05:00"));
        }
        demoRecord(state, "mediciones", goal, start).put("indicator_id", indicator).put("value", 20);
        demoRecord(state, "mediciones", goal, start.plusWeeks(1)).put("indicator_id", indicator).put("value", 25);
        return state;
    }

    private static ObjectNode demoRecord(ObjectNode state, String table, String goal, LocalDate date) {
        return array(state, table).addObject().put("id", UUID.randomUUID().toString())
                .put("meta_id", goal).put("date", date.toString());
    }
}
