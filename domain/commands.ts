import { z } from "zod";
import type { State, Usuario, Meta, Table, Indicador } from "./types";
import { today, hours, monday, addDays } from "./core";
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (d) =>
      !Number.isNaN(Date.parse(d)) &&
      new Date(d).toISOString().slice(0, 10) === d,
    "Fecha inválida",
  );
const text = z.string().trim().min(1).max(160);
const num = z.coerce.number().finite();
const id = z.string().uuid();
const indicator = z.object({
  kind: z.enum(["PESO", "PERIMETRO", "FUERZA", "SEMANAS_CUMPLIDAS"]),
  name: text,
  unit: text,
  initial: num.min(0),
  target: num.min(0),
  exercise: z.string().trim().max(160).default(""),
  technique: z.string().trim().max(300).default(""),
  equipment: z.string().trim().max(160).default(""),
  reps: z.coerce.number().int().min(0).default(0),
});
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("propose"),
    type: z.enum([
      "BAJAR_PESO",
      "GANAR_MASA",
      "MEJORAR_FUERZA",
      "MANTENER_HABITOS",
    ]),
    start_date: date,
    end_date: date,
  }),
  z.object({
    action: z.literal("activate"),
    meta_id: id,
    start_date: date,
    end_date: date,
    exercise_days: z.coerce.number().int().min(1).max(7),
    food_days: z.coerce.number().int().min(1).max(7),
    sleep_days: z.coerce.number().int().min(1).max(7),
    sleep_min: num.min(0.1).max(24),
    sleep_max: num.min(0.1).max(24),
    indicators: z.array(indicator).min(1).max(6),
  }),
  z.object({ action: z.literal("close"), meta_id: id, end_date: date }),
  z.object({
    action: z.literal("observe"),
    meta_id: id,
    observation: z.string().trim().max(2000),
  }),
  z.object({
    action: z.literal("exercise"),
    meta_id: id,
    id: id.optional(),
    date,
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default("12:00"),
    name: text,
    series: z.coerce.number().int().min(1).max(100),
    reps: z.coerce.number().int().min(1).max(1000),
    weight: num.min(0).max(2000),
    performed: z.boolean(),
  }),
  z.object({
    action: z.literal("food"),
    meta_id: id,
    id: id.optional(),
    date,
    kind: z.enum(["declaracion", "comida"]),
    complete: z.boolean(),
    meal: z.string().trim().max(500),
  }),
  z.object({
    action: z.literal("sleep"),
    meta_id: id,
    id: id.optional(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  }),
  z.object({
    action: z.literal("measurement"),
    meta_id: id,
    id: id.optional(),
    date,
    indicator_id: id,
    value: num.min(0).max(100000),
  }),
  z.object({
    action: z.literal("substance"),
    meta_id: id,
    id: id.optional(),
    date,
    name: text,
    amount: text,
  }),
  z.object({
    action: z.literal("delete"),
    meta_id: id,
    id,
    table: z.enum([
      "ejercicios",
      "alimentos",
      "suenos",
      "mediciones",
      "sustancias",
    ]),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export interface Change {
  table: Table;
  row?: Record<string, unknown>;
  deleteId?: string;
  activation?: { meta: Meta; indicators: Indicador[] };
}
export function authorize(user: Usuario, state: State, metaId: string) {
  const meta = state.metas.find((m) => m.id === metaId);
  if (!meta) throw new DomainError("Meta no encontrada.", 404);
  const client = state.usuarios.find((u) => u.id === meta.client_id);
  if (
    user.id !== meta.client_id &&
    !(user.role === "entrenador" && client?.trainer_id === user.id)
  )
    throw new DomainError("No tienes acceso a esta meta.", 403);
  return meta;
}
export function prepare(
  raw: unknown,
  user: Usuario,
  state: State,
  asOf = today(user.timezone),
): Change {
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success)
    throw new DomainError(
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" · "),
    );
  const c = parsed.data;
  if (c.action === "propose") {
    if (user.role !== "cliente")
      throw new DomainError("Solo el cliente puede proponer su meta.", 403);
    if (
      c.end_date < c.start_date ||
      Date.parse(c.end_date) - Date.parse(c.start_date) > 366 * 86400000
    )
      throw new DomainError(
        "Revisa el periodo: máximo un año y fin posterior o igual al inicio.",
      );
    if (
      state.metas.some(
        (m) => m.client_id === user.id && m.status === "propuesta",
      )
    )
      throw new DomainError(
        "Ya tienes una propuesta pendiente. Pide a tu entrenador que la revise.",
      );
    return {
      table: "metas",
      row: {
        id: crypto.randomUUID(),
        client_id: user.id,
        type: c.type,
        status: "propuesta",
        start_date: c.start_date,
        end_date: c.end_date,
        exercise_days: 0,
        food_days: 0,
        sleep_days: 0,
        sleep_min: 0,
        sleep_max: 0,
        observation: "",
        observation_author: null,
        observation_at: null,
      },
    };
  }
  const meta = authorize(user, state, c.meta_id);
  if (["activate", "close", "observe"].includes(c.action)) {
    if (user.role !== "entrenador")
      throw new DomainError(
        "Esta operación corresponde al entrenador asignado.",
        403,
      );
    if (meta.status === "cerrada")
      throw new DomainError("El historial cerrado es de solo lectura.");
    if (c.action === "activate") {
      if (meta.status !== "propuesta")
        throw new DomainError("Solo se pueden activar metas propuestas.");
      if (
        state.metas.some(
          (m) =>
            m.id !== meta.id &&
            m.client_id === meta.client_id &&
            m.status === "activa",
        )
      )
        throw new DomainError(
          "El cliente ya tiene una meta activa. Ciérrala antes de activar otra.",
        );
      if (
        c.start_date > c.end_date ||
        Date.parse(c.end_date) - Date.parse(c.start_date) > 366 * 86400000
      )
        throw new DomainError(
          "Las fechas deben estar ordenadas y el periodo no superar un año.",
        );
      if (c.sleep_min > c.sleep_max)
        throw new DomainError("El mínimo de sueño no puede superar el máximo.");
      if (
        state.metas.some(
          (m) =>
            m.id !== meta.id &&
            m.client_id === meta.client_id &&
            m.status !== "propuesta" &&
            c.start_date <= m.end_date &&
            c.end_date >= m.start_date,
        )
      )
        throw new DomainError(
          "El periodo se solapa con otra meta. La siguiente debe empezar después de su fin.",
        );
      const compatible =
        meta.type === "MANTENER_HABITOS"
          ? ["SEMANAS_CUMPLIDAS"]
          : meta.type === "MEJORAR_FUERZA"
            ? ["FUERZA"]
            : ["PESO", "PERIMETRO"];
      if (c.indicators.some((i) => !compatible.includes(i.kind)))
        throw new DomainError(
          "Hay indicadores incompatibles con el tipo de meta.",
        );
      for (const i of c.indicators) {
        if (i.initial === i.target)
          throw new DomainError(
            "El valor inicial y el objetivo deben ser distintos.",
          );
        if (
          i.kind === "FUERZA" &&
          (!i.exercise || !i.technique || !i.equipment || i.reps < 1)
        )
          throw new DomainError(
            "Fuerza exige ejercicio, técnica, equipo y repeticiones positivas.",
          );
        if (i.kind === "SEMANAS_CUMPLIDAS") {
          const first =
            monday(c.start_date) === c.start_date
              ? c.start_date
              : addDays(monday(c.start_date), 7);
          const weeks = Math.max(
            0,
            Math.floor(
              (Date.parse(c.end_date) - Date.parse(first) + 86400000) /
                (7 * 86400000),
            ),
          );
          if (
            i.initial !== 0 ||
            !Number.isInteger(i.target) ||
            i.target < 1 ||
            i.target > weeks ||
            i.unit !== "semanas"
          )
            throw new DomainError(
              "Semanas cumplidas exige inicial 0, unidad semanas y un objetivo entero que quepa en semanas completas del periodo.",
            );
        }
      }
      const { action, meta_id, indicators, ...fields } = c;
      void action;
      void meta_id;
      return {
        table: "metas",
        activation: {
          meta: { ...meta, ...fields, status: "activa" },
          indicators: indicators.map((i) => ({
            ...i,
            id: crypto.randomUUID(),
            meta_id: meta.id,
          })),
        },
      };
    }
    if (c.action === "close") {
      const clientToday = today(
        state.usuarios.find((u) => u.id === meta.client_id)?.timezone ??
          user.timezone,
      );
      if (
        c.end_date < meta.start_date ||
        c.end_date > clientToday ||
        c.end_date > meta.end_date
      )
        throw new DomainError(
          "El cierre debe estar entre el inicio y el menor de hoy o el fin previsto.",
        );
      const dates = [
        ...state.ejercicios,
        ...state.alimentos,
        ...state.suenos,
        ...state.mediciones,
        ...state.sustancias,
      ]
        .filter((r) => r.meta_id === meta.id)
        .map((r) => r.date);
      if (dates.some((d) => d > c.end_date))
        throw new DomainError(
          "No puedes cerrar antes de los registros existentes.",
        );
      return {
        table: "metas",
        row: { ...meta, status: "cerrada", end_date: c.end_date },
      };
    }
    if (c.action === "observe")
      return {
        table: "metas",
        row: {
          ...meta,
          observation: c.observation,
          observation_author: user.id,
          observation_at: new Date().toISOString(),
        },
      };
  }
  if (user.role !== "cliente" || meta.client_id !== user.id)
    throw new DomainError(
      "Solo el cliente puede modificar sus declaraciones y mediciones.",
      403,
    );
  if (meta.status !== "activa")
    throw new DomainError("Solo se admiten registros en una meta activa.");
  if (c.action === "delete") {
    if (
      !state[c.table].some(
        (r) => r.id === c.id && "meta_id" in r && r.meta_id === meta.id,
      )
    )
      throw new DomainError("Registro no encontrado.", 404);
    return { table: c.table, deleteId: c.id };
  }
  if (c.action === "activate" || c.action === "close" || c.action === "observe")
    throw new DomainError("Acción no válida.");
  const localDate =
    c.action === "sleep" ? today(user.timezone, new Date(c.end)) : c.date;
  if (
    localDate < meta.start_date ||
    localDate > meta.end_date ||
    localDate > asOf
  )
    throw new DomainError(
      "La fecha debe pertenecer a la meta activa y no puede ser futura.",
    );
  const tableMap = {
    exercise: "ejercicios",
    food: "alimentos",
    sleep: "suenos",
    measurement: "mediciones",
    substance: "sustancias",
  } as const;
  const table = tableMap[c.action];
  if (c.id && !state[table].some((r) => r.id === c.id && r.meta_id === meta.id))
    throw new DomainError("Registro no encontrado.", 404);
  if (c.action === "sleep") {
    if (hours(c.start, c.end) <= 0 || hours(c.start, c.end) > 24)
      throw new DomainError(
        "El descanso debe terminar después del inicio y durar como máximo 24 horas.",
      );
    if (
      state.suenos.some(
        (r) =>
          r.meta_id === meta.id &&
          r.id !== c.id &&
          Date.parse(c.start) < Date.parse(r.end) &&
          Date.parse(c.end) > Date.parse(r.start),
      )
    )
      throw new DomainError("El descanso se superpone con otro registro.");
    const total = state.suenos
      .filter(
        (r) => r.meta_id === meta.id && r.id !== c.id && r.date === localDate,
      )
      .reduce((n, r) => n + hours(r.start, r.end), hours(c.start, c.end));
    if (total > 24)
      throw new DomainError(
        "La suma de descansos de un día no puede superar 24 horas.",
      );
  }
  if (c.action === "measurement") {
    const i = state.indicadores.find(
      (i) => i.id === c.indicator_id && i.meta_id === meta.id,
    );
    if (!i) throw new DomainError("Selecciona un indicador de esta meta.");
    if (i.kind === "SEMANAS_CUMPLIDAS")
      throw new DomainError(
        "Las semanas cumplidas se calculan automáticamente; no admiten mediciones manuales.",
      );
    if (
      state.mediciones.some(
        (r) => r.indicator_id === i.id && r.date === c.date && r.id !== c.id,
      )
    )
      throw new DomainError(
        "Ya existe una medición de este indicador en esa fecha. Edita la existente.",
      );
  }
  if (c.action === "food") {
    if (
      c.kind === "declaracion" &&
      state.alimentos.some(
        (r) =>
          r.meta_id === meta.id &&
          r.date === c.date &&
          r.kind === "declaracion" &&
          r.id !== c.id,
      )
    )
      throw new DomainError(
        "Solo se admite una declaración diaria. Edita la existente.",
      );
    if (c.kind === "comida" && !c.meal)
      throw new DomainError("Describe la comida.");
  }
  const { action, ...fields } = c;
  void action;
  return {
    table,
    row: {
      ...fields,
      id: c.id ?? crypto.randomUUID(),
      ...(c.action === "sleep" ? { date: localDate } : {}),
    },
  };
}
export function applyChange(state: State, c: Change): State {
  const next = structuredClone(state);
  if (c.activation) {
    next.metas = next.metas.map((m) =>
      m.id === c.activation!.meta.id ? c.activation!.meta : m,
    );
    next.indicadores.push(...c.activation.indicators);
  } else if (c.deleteId)
    next[c.table] = next[c.table].filter((r) => r.id !== c.deleteId) as never;
  else if (c.row) {
    const rows = next[c.table] as unknown as Record<string, unknown>[];
    const index = rows.findIndex((r) => r.id === c.row!.id);
    if (index >= 0) rows[index] = c.row;
    else rows.push(c.row);
  }
  return next;
}
export function scope(state: State, user: Usuario): State {
  const users = state.usuarios.filter(
    (u) =>
      u.id === user.id ||
      (user.role === "entrenador"
        ? u.trainer_id === user.id
        : u.id === user.trainer_id),
  );
  const metas = state.metas.filter(
    (m) =>
      m.client_id === user.id ||
      (user.role === "entrenador" && users.some((u) => u.id === m.client_id)),
  );
  const ids = new Set(metas.map((m) => m.id));
  return {
    ...state,
    usuarios: users,
    metas,
    indicadores: state.indicadores.filter((r) => ids.has(r.meta_id)),
    mediciones: state.mediciones.filter((r) => ids.has(r.meta_id)),
    ejercicios: state.ejercicios.filter((r) => ids.has(r.meta_id)),
    alimentos: state.alimentos.filter((r) => ids.has(r.meta_id)),
    suenos: state.suenos.filter((r) => ids.has(r.meta_id)),
    sustancias: state.sustancias.filter((r) => ids.has(r.meta_id)),
  };
}
