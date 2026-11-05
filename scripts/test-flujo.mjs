import assert from "node:assert/strict";

// Ejecutar contra una instancia local. Una sesión ficticia separada por ejecución.
const base = new URL(process.argv[2] ?? "http://localhost:3100").origin;
const cookies = new Map();
async function req(path, input, expected = 200) {
  const response = await fetch(base + path, {
    method: input ? "POST" : "GET",
    headers: {
      ...(input ? { "Content-Type": "application/json", Origin: base } : {}),
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
  for (const header of response.headers.getSetCookie()) {
    const [nameValue] = header.split(";");
    const [name, ...value] = nameValue.split("=");
    if (value.join("=")) cookies.set(name, value.join("="));
    else cookies.delete(name);
  }
  const data = await response
    .json()
    .catch(() => ({ error: "Respuesta no JSON" }));
  assert.equal(
    response.status,
    expected,
    `${path} ${input?.action ?? "GET"}: ${JSON.stringify(data)}`,
  );
  return data;
}
const session = (input, expected) => req("/api/session", input, expected);
const command = (input, expected) => req("/api/admin", input, expected);
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guayaquil",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const add = (d, n) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);

assert.equal((await session()).user, null);
await session({ action: "demo", role: "cliente", reset: true });
const { user, state } = await session();
assert.equal(user.role, "cliente");
assert.equal(
  state.usuarios.length,
  2,
  "Un cliente solo ve su perfil y su entrenador",
);
const active = state.metas.find((m) => m.status === "activa");
const exercise = {
  action: "exercise",
  meta_id: active.id,
  date: day,
  name: "Sentadilla de prueba",
  series: 3,
  reps: 10,
  weight: 20,
  performed: true,
};
assert.match((await command({ ...exercise, series: 0 }, 422)).error, /series/);
assert.match(
  (await command({ ...exercise, date: add(day, 1) }, 422)).error,
  /futura/,
);
await command(exercise);
const exerciseId = (await session()).state.ejercicios.find(
  (r) => r.name === exercise.name,
).id;
await command({ ...exercise, id: exerciseId, series: 4 });
assert.equal(
  (await session()).state.ejercicios.find((r) => r.id === exerciseId).series,
  4,
);
assert.match(
  (
    await command(
      {
        action: "measurement",
        meta_id: active.id,
        indicator_id: crypto.randomUUID(),
        date: day,
        value: 28,
      },
      422,
    )
  ).error,
  /indicador de esta meta/,
);
const indicator = state.indicadores[0];
const measurementDate = Array.from({ length: 7 }, (_, i) => add(day, -i)).find(
  (d) => !state.mediciones.some((m) => m.date === d),
);
await command({
  action: "measurement",
  meta_id: active.id,
  indicator_id: indicator.id,
  date: measurementDate,
  value: 27,
});
assert.match(
  (
    await command(
      {
        action: "measurement",
        meta_id: active.id,
        indicator_id: indicator.id,
        date: measurementDate,
        value: 28,
      },
      422,
    )
  ).error,
  /Ya existe una medición/,
);
const meal = state.alimentos[0];
assert.match(
  (
    await command(
      {
        action: "food",
        meta_id: active.id,
        date: meal.date,
        kind: "declaracion",
        complete: true,
        meal: "",
      },
      422,
    )
  ).error,
  /una declaración diaria/,
);
const sleep = state.suenos[0];
assert.match(
  (
    await command(
      {
        action: "sleep",
        meta_id: active.id,
        start: new Date(sleep.start).toISOString(),
        end: new Date(sleep.end).toISOString(),
      },
      422,
    )
  ).error,
  /superpone/,
);
const proposal = {
  action: "propose",
  type: "GANAR_MASA",
  start_date: add(day, 1),
  end_date: add(day, 60),
};
await command(proposal);
assert.match((await command(proposal, 422)).error, /propuesta pendiente/);
const proposalId = (await session()).state.metas.find(
  (m) => m.status === "propuesta",
).id;
await session({ action: "demo", role: "entrenador" });
assert.equal((await session()).user.role, "entrenador");
assert.match((await command(exercise, 403)).error, /Solo el cliente/);
const activation = {
  action: "activate",
  meta_id: proposalId,
  start_date: proposal.start_date,
  end_date: proposal.end_date,
  exercise_days: 4,
  food_days: 6,
  sleep_days: 5,
  sleep_min: 7,
  sleep_max: 9,
  indicators: [
    {
      kind: "PERIMETRO",
      name: "Perímetro de brazo",
      unit: "cm",
      initial: 29,
      target: 32,
    },
  ],
};
assert.match(
  (await command(activation, 422)).error,
  /ya tiene una meta activa/,
);
await command({
  action: "observe",
  meta_id: active.id,
  observation: "Observación de prueba",
});
await command({ action: "close", meta_id: active.id, end_date: day });
await command(activation);
const after = (await session()).state;
assert.equal(after.metas.find((m) => m.id === active.id).status, "cerrada");
assert.equal(
  after.metas.find((m) => m.id === active.id).observation,
  "Observación de prueba",
);
assert.equal(after.metas.find((m) => m.id === proposalId).status, "activa");
await session({ action: "demo", role: "cliente" });
assert.match(
  (await command({ ...exercise, id: exerciseId }, 422)).error,
  /meta activa/,
);
const cross = await fetch(base + "/api/admin", {
  method: "POST",
  headers: {
    Origin: "https://example.com",
    "Content-Type": "application/json",
  },
  body: "{}",
});
assert.equal(cross.status, 403);
await session({ action: "logout" });
assert.equal((await session()).user, null);
console.log(
  "OK: roles, aislamiento, propuesta, activación, cierre, observación, CRUD, FK, fechas, duplicados y origen de solicitudes.",
);
