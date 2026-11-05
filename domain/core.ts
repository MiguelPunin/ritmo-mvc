import type { State, Meta, Indicador } from "./types";
export const today = (timezone = "America/Guayaquil", now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export const addDays = (day: string, n: number) =>
  new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function daysBetween(start: string, end: string) {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}
export const monday = (d: string) =>
  addDays(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));
export const hours = (start: string, end: string) =>
  (Date.parse(end) - Date.parse(start)) / 3600000;
export function evaluate(
  state: State,
  meta: Meta,
  from: string,
  to: string,
  asOf: string,
) {
  const first = [meta.start_date, from].sort().at(-1)!;
  const last = [meta.end_date, to, asOf].sort()[0];
  const eligible = daysBetween(first, last);
  const valid = {
    exercise: new Set<string>(),
    food: new Set<string>(),
    sleep: new Set<string>(),
  };
  const covered = {
    exercise: new Set<string>(),
    food: new Set<string>(),
    sleep: new Set<string>(),
  };
  const through = daysBetween(meta.start_date, last);
  for (const d of through) {
    const exercises = state.ejercicios.filter(
      (r) => r.meta_id === meta.id && r.date === d,
    );
    if (exercises.length) covered.exercise.add(d);
    if (exercises.some((r) => r.performed)) valid.exercise.add(d);
    const food = state.alimentos.find(
      (r) => r.meta_id === meta.id && r.date === d && r.kind === "declaracion",
    );
    if (food) covered.food.add(d);
    if (food?.complete) valid.food.add(d);
    const sleep = state.suenos.filter(
      (r) => r.meta_id === meta.id && r.date === d,
    );
    if (sleep.length) covered.sleep.add(d);
    const total = sleep.reduce((n, r) => n + hours(r.start, r.end), 0);
    if (sleep.length && total >= meta.sleep_min && total <= meta.sleep_max)
      valid.sleep.add(d);
  }
  const metrics = (
    [
      ["exercise", "Ejercicio", meta.exercise_days],
      ["food", "Alimentación", meta.food_days],
      ["sleep", "Sueño", meta.sleep_days],
    ] as const
  ).map(([key, label, target]) => {
    const adjusted = (target * eligible.length) / 7;
    const count = eligible.filter((d) => valid[key].has(d)).length;
    return {
      key,
      label,
      valid: count,
      covered: eligible.filter((d) => covered[key].has(d)).length,
      target: adjusted,
      percent: adjusted > 0 ? Math.min(100, (count / adjusted) * 100) : null,
    };
  });
  const completeWeeks = through
    .filter((d) => monday(d) === d && addDays(d, 6) <= last)
    .filter((d) => {
      const week = daysBetween(d, addDays(d, 6));
      return (
        week.filter((x) => valid.exercise.has(x)).length >=
          meta.exercise_days &&
        week.filter((x) => valid.food.has(x)).length >= meta.food_days &&
        week.filter((x) => valid.sleep.has(x)).length >= meta.sleep_days &&
        week.every((x) => covered.food.has(x) && covered.sleep.has(x))
      );
    }).length;
  const indicators = state.indicadores
    .filter((i) => i.meta_id === meta.id)
    .map((i) => indicatorProgress(state, i, to, asOf, completeWeeks));
  return {
    eligible: eligible.length,
    metrics,
    combined: eligible.length
      ? metrics.reduce((n, m) => n + (m.percent ?? 0), 0) / 3
      : null,
    provisional:
      eligible.length > 0 &&
      (metrics.some((m) => m.covered < eligible.length) ||
        (last === asOf && meta.status === "activa")),
    completeWeeks,
    indicators,
  };
}
function indicatorProgress(
  state: State,
  i: Indicador,
  to: string,
  asOf: string,
  weeks: number,
) {
  const measurement = state.mediciones
    .filter((m) => m.indicator_id === i.id && m.date <= to && m.date <= asOf)
    .sort(
      (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
    )[0];
  const current =
    i.kind === "SEMANAS_CUMPLIDAS" ? weeks : (measurement?.value ?? null);
  return {
    ...i,
    current,
    date: measurement?.date ?? null,
    percent:
      current === null
        ? null
        : Math.max(
            0,
            Math.min(
              100,
              ((current - i.initial) / (i.target - i.initial)) * 100,
            ),
          ),
  };
}
