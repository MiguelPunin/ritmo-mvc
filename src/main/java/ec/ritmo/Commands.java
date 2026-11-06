package ec.ritmo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static ec.ritmo.RitmoService.find;
import static ec.ritmo.RitmoService.rows;

@Service
final class Commands {
    record Change(String table, String id, boolean existing, ObjectNode row, ArrayNode indicators) {}

    private static final Map<String, String> TABLE = Map.of("exercise", "ejercicios", "food", "alimentos",
            "sleep", "suenos", "measurement", "mediciones", "substance", "sustancias");
    private static final Set<String> GOAL_TYPES = Set.of("BAJAR_PESO", "GANAR_MASA", "DEFINIR",
            "MEJORAR_FUERZA", "MANTENER_HABITOS");
    private static final Set<String> DAYS = Set.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo");
    private static final Set<String> GROUPS = Set.of("Cuerpo completo", "Tren superior", "Tren inferior", "Hombros",
            "Pecho", "Espalda", "Piernas", "Bíceps", "Tríceps", "Cuádriceps", "Glúteos", "Abdomen", "Cardio");

    private final ObjectMapper json;

    Commands(ObjectMapper json) {
        this.json = json;
    }

    Change prepare(JsonNode input, JsonNode user, ObjectNode state) {
        String action = input.path("action").asText();
        String userId = user.path("id").asText();
        boolean trainer = user.path("role").asText().equals("entrenador");
        if ("propose".equals(action)) return propose(input, state, userId, trainer);
        if (!Set.of("activate", "close", "cancel", "observe", "delete").contains(action) && !TABLE.containsKey(action)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Acción no válida.");
        }
        String metaId = id(input, "meta_id");
        var meta = (ObjectNode) find(state, "metas", metaId);
        requireFound(meta, "Meta no encontrada.");
        if (Set.of("activate", "close", "cancel", "observe").contains(action)) {
            requireRole(trainer, "Esta operación corresponde al entrenador asignado.");
            require(!Set.of("cerrada", "cancelada").contains(meta.path("status").asText()),
                    "El historial cerrado es de solo lectura.");
            return manage(action, input, user, state, meta);
        }
        requireRole(!trainer && userId.equals(meta.path("client_id").asText()),
                "Solo el cliente puede modificar sus declaraciones y mediciones.");
        require("activa".equals(meta.path("status").asText()), "Solo se admiten registros en una meta activa.");
        return record(action, input, user, state, metaId, meta);
    }

    private Change propose(JsonNode input, ObjectNode state, String userId, boolean trainer) {
        requireRole(!trainer, "Solo el cliente puede proponer su meta.");
        LocalDate start = date(input, "start_date");
        LocalDate end = date(input, "end_date");
        period(start, end);
        require(rows(state, "metas").stream().noneMatch(m -> userId.equals(m.path("client_id").asText())
                && "propuesta".equals(m.path("status").asText())), "Ya tienes una propuesta pendiente.");
        String id = UUID.randomUUID().toString();
        var row = json.createObjectNode().put("id", id).put("client_id", userId)
                .put("type", choice(input, "type", GOAL_TYPES)).put("status", "propuesta")
                .put("start_date", start.toString()).put("end_date", end.toString())
                .put("exercise_days", 0).put("food_days", 0).put("sleep_days", 0).put("sleep_min", 0)
                .put("sleep_max", 0).put("observation", "").putNull("observation_author").putNull("observation_at");
        if (input.has("reported_weight_kg")) row.put("reported_weight_kg", number(input, "reported_weight_kg", 20, 500));
        if (input.has("goal_details")) row.put("goal_details", text(input, "goal_details", 0, 1000));
        return new Change("metas", id, false, row, null);
    }

    private Change manage(String action, JsonNode input, JsonNode user, ObjectNode state, ObjectNode meta) {
        String id = meta.path("id").asText();
        String clientId = meta.path("client_id").asText();
        var client = find(state, "usuarios", clientId);
        requireRole(client != null && user.path("id").asText().equals(client.path("trainer_id").asText()),
                "No tienes acceso a esta meta.");
        if ("activate".equals(action)) return activate(input, user, state, meta, id, clientId);
        var row = meta.deepCopy();
        if ("observe".equals(action)) {
            observation(row, user, text(input, "observation", 0, 2000));
        } else {
            LocalDate start = date(meta, "start_date");
            LocalDate today = LocalDate.now(zone(client));
            if ("cancel".equals(action)) {
                require(start.isAfter(today), "La meta ya empezó. Usa Cerrar meta.");
                row.put("status", "cancelada");
            } else {
                LocalDate planned = date(meta, "end_date");
                LocalDate latest = planned.isBefore(today) ? planned : today;
                LocalDate end = date(input, "end_date");
                require(!start.isAfter(latest), "Esta meta todavía no empieza.");
                require(!end.isBefore(start) && !end.isAfter(latest),
                        "Elige una fecha de cierre entre " + start + " y " + latest + ".");
                for (var table : RitmoService.RECORDS) {
                    require(rows(state, table).stream().noneMatch(r -> id.equals(r.path("meta_id").asText())
                            && date(r, "date").isAfter(end)), "No puedes cerrar antes de los registros existentes.");
                }
                row.put("status", "cerrada").put("end_date", end.toString());
            }
        }
        return new Change("metas", id, true, row, null);
    }

    private Change activate(JsonNode input, JsonNode user, ObjectNode state, ObjectNode meta, String id, String clientId) {
        require("propuesta".equals(meta.path("status").asText()), "Solo se pueden activar metas propuestas.");
        var otherGoals = rows(state, "metas").stream()
                .filter(m -> clientId.equals(m.path("client_id").asText()) && !id.equals(m.path("id").asText())).toList();
        require(otherGoals.stream().noneMatch(m -> "activa".equals(m.path("status").asText())),
                "El cliente ya tiene una meta activa. Ciérrala antes de activar otra.");
        LocalDate start = date(input, "start_date");
        LocalDate end = date(input, "end_date");
        period(start, end);
        var min = number(input, "sleep_min", 0.1, 24);
        var max = number(input, "sleep_max", 0.1, 24);
        require(min.compareTo(max) <= 0, "El mínimo de sueño no puede superar el máximo.");
        require(otherGoals.stream().noneMatch(m -> Set.of("activa", "cerrada").contains(m.path("status").asText())
                && !start.isAfter(date(m, "end_date")) && !end.isBefore(date(m, "start_date"))),
                "El periodo se solapa con otra meta.");
        int exerciseDays = integer(input, "exercise_days", 1, 7);
        var row = meta.deepCopy().put("status", "activa").put("start_date", start.toString())
                .put("end_date", end.toString()).put("exercise_days", exerciseDays)
                .put("food_days", integer(input, "food_days", 1, 7)).put("sleep_days", integer(input, "sleep_days", 1, 7))
                .put("sleep_min", min).put("sleep_max", max);
        if (input.has("training_plan")) row.set("training_plan", routine(input.path("training_plan"), exerciseDays));
        if (input.has("observation")) {
            var comment = text(input, "observation", 0, 2000);
            if (!comment.isEmpty()) observation(row, user, comment);
        }
        var entries = input.path("indicators");
        require(entries.isArray() && entries.size() >= 1 && entries.size() <= 6, "Configura de 1 a 6 indicadores.");
        var allowed = switch (meta.path("type").asText()) {
            case "MANTENER_HABITOS" -> Set.of("SEMANAS_CUMPLIDAS");
            case "MEJORAR_FUERZA" -> Set.of("FUERZA");
            default -> Set.of("PESO", "PERIMETRO");
        };
        var indicators = json.createArrayNode();
        for (var entry : entries) {
            indicators.add(indicator(entry, allowed, meta, id, start, end));
        }
        return new Change("metas", id, true, row, indicators);
    }

    private ObjectNode indicator(JsonNode entry, Set<String> allowed, JsonNode meta, String id, LocalDate start, LocalDate end) {
        var kind = choice(entry, "kind", allowed);
        var initial = number(entry, "initial", 0, Double.MAX_VALUE);
        var target = number(entry, "target", 0, Double.MAX_VALUE);
        var unit = text(entry, "unit", 1, 160);
        if ("PESO".equals(kind) && meta.hasNonNull("reported_weight_kg")) {
            initial = meta.path("reported_weight_kg").decimalValue();
            unit = "kg";
        }
        require(initial.compareTo(target) != 0, "El valor inicial y el objetivo deben ser distintos.");
        var exercise = optional(entry, "exercise", 160);
        var technique = optional(entry, "technique", 300);
        var equipment = optional(entry, "equipment", 160);
        int reps = entry.has("reps") ? integer(entry, "reps", 0, Integer.MAX_VALUE) : 0;
        if ("FUERZA".equals(kind)) {
            require(!exercise.isEmpty() && !technique.isEmpty() && !equipment.isEmpty() && reps > 0,
                    "Fuerza exige ejercicio, técnica, equipo y repeticiones positivas.");
        }
        if ("SEMANAS_CUMPLIDAS".equals(kind)) {
            var first = start.with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
            long weeks = Math.max(0, ChronoUnit.DAYS.between(first, end.plusDays(1)) / 7);
            require(initial.signum() == 0 && target.stripTrailingZeros().scale() <= 0 && target.signum() > 0
                    && target.compareTo(BigDecimal.valueOf(weeks)) <= 0 && "semanas".equals(unit),
                    "El objetivo debe caber en las semanas completas del periodo.");
        }
        return json.createObjectNode().put("id", UUID.randomUUID().toString()).put("meta_id", id)
                .put("kind", kind).put("name", text(entry, "name", 1, 160)).put("unit", unit)
                .put("initial", initial).put("target", target).put("exercise", exercise)
                .put("technique", technique).put("equipment", equipment).put("reps", reps);
    }

    private ArrayNode routine(JsonNode plan, int exerciseDays) {
        require(plan.isArray() && plan.size() == exerciseDays, "El número de días debe coincidir con la rutina.");
        var days = new HashSet<String>();
        var result = json.createArrayNode();
        for (var entry : plan) {
            var day = choice(entry, "day", DAYS);
            require(days.add(day), "Selecciona días distintos.");
            var groups = entry.path("groups");
            require(groups.isArray() && !groups.isEmpty() && groups.size() <= GROUPS.size(), "Selecciona grupos musculares.");
            var seen = new HashSet<String>();
            for (var group : groups) {
                require(group.isTextual() && GROUPS.contains(group.asText()) && seen.add(group.asText()),
                        "Selecciona grupos válidos y sin repetir.");
            }
            result.addObject().put("day", day).put("minutes", integer(entry, "minutes", 1, 1440)).set("groups", groups);
        }
        return result;
    }

    private Change record(String action, JsonNode input, JsonNode user, ObjectNode state, String metaId, ObjectNode meta) {
        boolean delete = "delete".equals(action);
        String table = delete ? choice(input, "table", Set.copyOf(RitmoService.RECORDS)) : TABLE.get(action);
        boolean existing = delete || input.has("id");
        String id = existing ? id(input, "id") : UUID.randomUUID().toString();
        if (existing) {
            var old = find(state, table, id);
            requireFound(old != null && metaId.equals(old.path("meta_id").asText()) ? old : null, "Registro no encontrado.");
        }
        if (delete) return new Change(table, id, true, null, null);
        var zone = zone(user);
        LocalDate day = "sleep".equals(action) ? timestamp(input, "end").atZone(zone).toLocalDate() : date(input, "date");
        require(!day.isBefore(date(meta, "start_date")) && !day.isAfter(date(meta, "end_date")) && !day.isAfter(LocalDate.now(zone)),
                "La fecha debe pertenecer a la meta activa y no puede ser futura.");
        var row = json.createObjectNode().put("id", id).put("meta_id", metaId).put("date", day.toString());
        var others = rows(state, table).stream().filter(r -> metaId.equals(r.path("meta_id").asText())
                && !id.equals(r.path("id").asText())).toList();
        switch (action) {
            case "exercise" -> {
                var time = input.has("time") ? text(input, "time", 5, 5) : "12:00";
                require(time.matches("([01]\\d|2[0-3]):[0-5]\\d"), "Hora inválida.");
                row.put("time", time).put("name", text(input, "name", 1, 160))
                        .put("series", integer(input, "series", 1, 100)).put("reps", integer(input, "reps", 1, 1000))
                        .put("weight", number(input, "weight", 0, 2000)).put("performed", bool(input, "performed"));
            }
            case "food" -> {
                var kind = choice(input, "kind", Set.of("declaracion", "comida"));
                require(!"declaracion".equals(kind) || others.stream().noneMatch(r ->
                        "declaracion".equals(r.path("kind").asText()) && sameDay(r, day)),
                        "Solo se admite una declaración diaria. Edita la existente.");
                row.put("kind", kind).put("complete", bool(input, "complete"))
                        .put("meal", text(input, "meal", "comida".equals(kind) ? 1 : 0, 500));
            }
            case "sleep" -> sleep(input, others, row, day);
            case "measurement" -> {
                var indicatorId = id(input, "indicator_id");
                var indicator = find(state, "indicadores", indicatorId);
                require(indicator != null && metaId.equals(indicator.path("meta_id").asText()),
                        "Selecciona un indicador de esta meta.");
                require(!"SEMANAS_CUMPLIDAS".equals(indicator.path("kind").asText()),
                        "Las semanas cumplidas se calculan automáticamente.");
                require(others.stream().noneMatch(r -> indicatorId.equals(r.path("indicator_id").asText()) && sameDay(r, day)),
                        "Ya existe una medición de este indicador en esa fecha. Edita la existente.");
                row.put("indicator_id", indicatorId).put("value", number(input, "value", 0, 100000));
            }
            case "substance" -> row.put("name", text(input, "name", 1, 160)).put("amount", text(input, "amount", 1, 160));
            default -> throw new ApiException("Acción no válida.");
        }
        return new Change(table, id, existing, row, null);
    }

    private static void sleep(JsonNode input, List<JsonNode> others, ObjectNode row, LocalDate day) {
        var start = timestamp(input, "start");
        var end = timestamp(input, "end");
        var duration = Duration.between(start, end);
        var limit = Duration.ofDays(1);
        require(!duration.isNegative() && !duration.isZero() && duration.compareTo(limit) <= 0,
                "El descanso debe terminar después del inicio y durar como máximo 24 horas.");
        var total = duration;
        for (var r : others) {
            var otherStart = timestamp(r, "start");
            var otherEnd = timestamp(r, "end");
            require(!start.isBefore(otherEnd) || !end.isAfter(otherStart), "El descanso se superpone con otro registro.");
            if (sameDay(r, day)) total = total.plus(Duration.between(otherStart, otherEnd));
        }
        require(total.compareTo(limit) <= 0, "La suma de descansos de un día no puede superar 24 horas.");
        row.put("start", start.toString()).put("end", end.toString());
    }

    private static boolean sameDay(JsonNode row, LocalDate day) {
        return day.toString().equals(row.path("date").asText());
    }

    private static void observation(ObjectNode row, JsonNode user, String value) {
        row.put("observation", value).put("observation_author", user.path("id").asText())
                .put("observation_at", Instant.now().toString());
    }

    private static void period(LocalDate start, LocalDate end) {
        require(!end.isBefore(start) && ChronoUnit.DAYS.between(start, end) <= 366,
                "Revisa el periodo: máximo un año y fin posterior o igual al inicio.");
    }

    private static ZoneId zone(JsonNode user) {
        return ZoneId.of(user.path("timezone").asText("America/Guayaquil"));
    }

    private static LocalDate date(JsonNode data, String field) {
        String value = text(data, field, 10, 10);
        try {
            return LocalDate.parse(value);
        } catch (DateTimeException e) {
            throw new ApiException("Fecha inválida: " + field);
        }
    }

    private static Instant timestamp(JsonNode data, String field) {
        try {
            return OffsetDateTime.parse(data.path(field).asText()).toInstant();
        } catch (DateTimeException e) {
            throw new ApiException("Fecha y hora inválidas: " + field);
        }
    }

    private static String id(JsonNode data, String field) {
        String value = text(data, field, 36, 36);
        require(value.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"), "Identificador inválido: " + field);
        return UUID.fromString(value).toString();
    }

    private static String choice(JsonNode data, String field, Set<String> options) {
        var value = data.path(field).asText();
        require(options.contains(value), "Valor inválido: " + field);
        return value;
    }

    private static String optional(JsonNode data, String field, int max) {
        return data.has(field) ? text(data, field, 0, max) : "";
    }

    private static String text(JsonNode data, String field, int min, int max) {
        var node = data.path(field);
        var value = node.asText().strip();
        require(node.isTextual() && value.length() >= min && value.length() <= max, "Valor inválido: " + field);
        return value;
    }

    private static BigDecimal number(JsonNode data, String field, double min, double max) {
        var node = data.path(field);
        try {
            require(node.isTextual() || node.isNumber(), "Valor inválido: " + field);
            var value = new BigDecimal(node.asText().strip());
            require(value.compareTo(BigDecimal.valueOf(min)) >= 0 && value.compareTo(BigDecimal.valueOf(max)) <= 0,
                    "Valor fuera de rango: " + field);
            return value;
        } catch (NumberFormatException e) {
            throw new ApiException("Valor inválido: " + field);
        }
    }

    private static int integer(JsonNode data, String field, int min, int max) {
        try {
            return number(data, field, min, max).intValueExact();
        } catch (ArithmeticException e) {
            throw new ApiException("Se requiere un entero: " + field);
        }
    }

    private static boolean bool(JsonNode data, String field) {
        var node = data.path(field);
        require(node.isBoolean(), "Valor inválido: " + field);
        return node.booleanValue();
    }

    private static void requireFound(JsonNode row, String message) {
        if (row == null) throw new ApiException(HttpStatus.NOT_FOUND, message);
    }

    private static void requireRole(boolean valid, String message) {
        if (!valid) throw new ApiException(HttpStatus.FORBIDDEN, message);
    }

    private static void require(boolean valid, String message) {
        if (!valid) throw new ApiException(message);
    }
}
