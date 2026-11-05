import { addDays, monday, today } from "./core";
import type { State } from "./types";
export function seed(): State {
  const now = today();
  const start = addDays(monday(now), -7);
  const end = addDays(start, 55);
  const trainer = "11111111-1111-4111-8111-111111111111",
    client = "22222222-2222-4222-8222-222222222222",
    other = "33333333-3333-4333-8333-333333333333",
    goal = "44444444-4444-4444-8444-444444444444",
    indicator = "55555555-5555-4555-8555-555555555555";
  const state: State = {
    usuarios: [
      {
        id: trainer,
        name: "Daniela Torres",
        role: "entrenador",
        trainer_id: null,
        timezone: "America/Guayaquil",
      },
      {
        id: client,
        name: "Miguel Andrés Punin",
        role: "cliente",
        trainer_id: trainer,
        timezone: "America/Guayaquil",
      },
      {
        id: other,
        name: "Sofía Andrade",
        role: "cliente",
        trainer_id: trainer,
        timezone: "America/Guayaquil",
      },
    ],
    metas: [
      {
        id: goal,
        client_id: client,
        type: "MEJORAR_FUERZA",
        status: "activa",
        start_date: start,
        end_date: end,
        exercise_days: 4,
        food_days: 6,
        sleep_days: 5,
        sleep_min: 7,
        sleep_max: 9,
        observation:
          "Buen comienzo. Mantén la técnica en cada repetición y prioriza el descanso entre sesiones.",
        observation_author: trainer,
        observation_at: new Date().toISOString(),
      },
    ],
    indicadores: [
      {
        id: indicator,
        meta_id: goal,
        kind: "FUERZA",
        name: "Press de banca",
        unit: "kg",
        initial: 20,
        target: 30,
        exercise: "Press de banca",
        technique: "Barra al pecho, recorrido completo",
        equipment: "Barra olímpica",
        reps: 10,
      },
    ],
    mediciones: [],
    ejercicios: [],
    alimentos: [],
    suenos: [],
    sustancias: [],
  };
  for (let n = 0; n < 10; n++) {
    const date = addDays(start, n);
    if (date > now) break;
    if (n % 3 !== 2)
      state.ejercicios.push({
        id: crypto.randomUUID(),
        meta_id: goal,
        date,
        name: "Press de banca",
        time: "18:00",
        series: 3,
        reps: 10,
        weight: 20 + n * 0.5,
        performed: true,
      });
    state.alimentos.push({
      id: crypto.randomUUID(),
      meta_id: goal,
      date,
      kind: "declaracion",
      complete: n % 5 !== 4,
      meal: "",
    });
    if (n !== 3)
      state.suenos.push({
        id: crypto.randomUUID(),
        meta_id: goal,
        date,
        start: addDays(date, -1) + "T23:00:00-05:00",
        end: date + `T0${n % 4 === 0 ? "6" : "7"}:00:00-05:00`,
      });
  }
  state.mediciones.push(
    {
      id: crypto.randomUUID(),
      meta_id: goal,
      indicator_id: indicator,
      date: start,
      value: 20,
    },
    {
      id: crypto.randomUUID(),
      meta_id: goal,
      indicator_id: indicator,
      date: addDays(start, 7),
      value: 25,
    },
  );
  return state;
}
