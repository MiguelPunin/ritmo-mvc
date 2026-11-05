"use client";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Dumbbell,
  Flame,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type {
  State,
  Usuario,
  Meta,
  Indicador,
  IndicatorKind,
} from "../domain/types";
import {
  goalLabels,
  kindLabels,
  muscleGroups,
  trainingDays,
} from "../domain/types";
import { addDays, evaluate, monday, today, hours } from "../domain/core";
type View = "resumen" | "metas" | "registro" | "historial" | "clientes";
type Data = {
  user: Usuario | null;
  state?: State;
  demo?: boolean;
  configured: boolean;
};
type Row = Record<string, any>;
type Modal = {
  kind:
    | "propose"
    | "activate"
    | "close"
    | "observe"
    | "record"
    | "delete"
    | "help"
    | "reset";
  meta?: Meta;
  record?: Row;
  table?: string;
};
const fmt = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 }).format(n);
const nice = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
  });
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
const tableNames: Record<string, string> = {
  ejercicios: "Ejercicio",
  alimentos: "Alimentación",
  suenos: "Sueño",
  mediciones: "Medición",
  sustancias: "Sustancias",
};
const actions: Record<string, string> = {
  ejercicios: "exercise",
  alimentos: "food",
  suenos: "sleep",
  mediciones: "measurement",
  sustancias: "substance",
};
async function api<T = unknown>(url: string, payload?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(
      (d as { error?: string })?.error ?? "No se pudo completar la operación.",
    );
  return d as T;
}
export default function App() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [view, setView] = useState<View>("resumen"),
    [clientId, setClientId] = useState(""),
    [goalId, setGoalId] = useState(""),
    [modal, setModal] = useState<Modal | null>(null),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [week, setWeek] = useState(0),
    [wholePeriod, setWholePeriod] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("todos");
  async function reload() {
    const d = await api<Data>("/api/session");
    setData(d);
    return d;
  }
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function session(p: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/session", p);
      await reload();
      setModal(null);
      setGoalId("");
      setClientId("");
      setView("resumen");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mutate(p: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/admin", p);
      await reload();
      setModal(null);
      setToast("Cambios guardados correctamente.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const open = (m: Modal) => {
    setError("");
    setModal(m);
  };
  if (!data)
    return (
      <div className="loading">
        <span className="brand-mark">
          <Activity />
        </span>
        <p>{error || "Preparando tu espacio…"}</p>
        {error && <button onClick={() => location.reload()}>Reintentar</button>}
      </div>
    );
  if (!data.user || !data.state)
    return (
      <Login
        configured={data.configured}
        busy={busy}
        error={error}
        onSession={session}
      />
    );
  const { user, state } = data,
    trainer = user.role === "entrenador";
  const clients = state.usuarios.filter((u) => u.role === "cliente");
  const client = trainer
    ? (clients.find((u) => u.id === clientId) ?? clients[0])
    : user;
  const goals = state.metas
    .filter((m) => m.client_id === client?.id)
    .sort(
      (a, b) =>
        ({ activa: 0, propuesta: 1, cerrada: 2, cancelada: 3 })[a.status] -
          { activa: 0, propuesta: 1, cerrada: 2, cancelada: 3 }[b.status] ||
        b.start_date.localeCompare(a.start_date),
    );
  const meta = goals.find((m) => m.id === goalId) ?? goals[0],
    active = goals.find((m) => m.status === "activa");
  const now = today(client?.timezone ?? user.timezone),
    weekStart = addDays(monday(now), week * 7),
    from = wholePeriod && meta ? meta.start_date : weekStart,
    to = wholePeriod && meta ? meta.end_date : addDays(weekStart, 6);
  const result = meta ? evaluate(state, meta, from, to, now) : null;
  const indicators = state.indicadores.filter((i) => i.meta_id === meta?.id);
  const records: Row[] = meta
    ? (
        [
          "ejercicios",
          "alimentos",
          "suenos",
          "mediciones",
          "sustancias",
        ] as const
      )
        .flatMap((table) =>
          state[table]
            .filter((r) => r.meta_id === meta.id)
            .map((r) => ({ ...r, table })),
        )
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const nav = [
    { id: "resumen", name: "Mi seguimiento", icon: LayoutDashboard },
    { id: "metas", name: "Metas y objetivos", icon: Target },
    { id: "registro", name: "Registro diario", icon: ClipboardList },
    { id: "historial", name: "Historial", icon: CalendarDays },
    ...(trainer ? [{ id: "clientes", name: "Mis clientes", icon: Users }] : []),
  ];
  const titles: Record<View, string> = {
    resumen: "Cada hábito cuenta.",
    metas: "Una meta, un plan.",
    registro: "Tu día, en perspectiva.",
    historial: "Tu esfuerzo deja huella.",
    clientes: "Acompaña cada proceso.",
  };
  const edit = (r: Row) =>
      open({ kind: "record", meta, record: r, table: r.table }),
    remove = (r: Row) =>
      open({ kind: "delete", meta, record: r, table: r.table });
  return (
    <div className="shell">
      <aside className={"sidebar " + (mobile ? "is-open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("resumen");
          }}
        >
          <span className="brand-mark">
            <Activity />
          </span>
          ritmo<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span>
            <Dumbbell size={19} />
          </span>
          <div>
            <strong>Tu espacio de bienestar</strong>
            <small>Metas · Hábitos · Progreso</small>
          </div>
        </div>
        <p className="nav-label">MI ESPACIO</p>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "selected" : ""}
              onClick={() => {
                setView(n.id as View);
                setMobile(false);
              }}
            >
              <n.icon size={19} />
              {n.name}
              {n.id === "metas" &&
                goals.some((m) => m.status === "propuesta") && (
                  <span className="nav-count">
                    {goals.filter((m) => m.status === "propuesta").length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Flame size={22} />
            <strong>La constancia se construye.</strong>
            <p>Un pequeño paso hoy es parte de un gran cambio.</p>
            <span>
              Vamos a tu ritmo <ArrowUpRight size={15} />
            </span>
          </div>
          <button className="help-link" onClick={() => open({ kind: "help" })}>
            <CircleHelp size={18} />
            Guía de uso
          </button>
          <div className="profile">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <strong>{user.name.split(" ").slice(0, 2).join(" ")}</strong>
              <small>{trainer ? "Entrenador" : "Cliente"}</small>
            </div>
            <button
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              onClick={() => session({ action: "logout" })}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle"
              aria-label="Abrir menú"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Mi espacio</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === view)?.name}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-dot" />
            {data.demo ? "Datos de demostración" : "Conectado a Supabase"}
            <button
              aria-label="Ver ayuda"
              onClick={() => open({ kind: "help" })}
            >
              <CircleHelp size={19} />
            </button>
            <span className="avatar small">{initials(user.name)}</span>
          </div>
        </header>
        {data.demo && (
          <div className="demo-bar">
            <span>
              <ShieldCheck size={15} />
              <strong>Modo demostración</strong>
              <span className="demo-detail">
                {" "}
                · Datos ficticios privados de esta sesión.
              </span>
            </span>
            <div>
              <button
                disabled={busy}
                onClick={() =>
                  session({
                    action: "demo",
                    role: trainer ? "cliente" : "entrenador",
                  })
                }
              >
                Ver como {trainer ? "cliente" : "entrenador"}{" "}
                <ArrowRight size={13} />
              </button>
              <button
                aria-label="Reiniciar demostración"
                onClick={() => open({ kind: "reset" })}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        )}
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {trainer
                  ? "PANEL DEL ENTRENADOR"
                  : `HOLA, ${user.name.split(" ")[0].toUpperCase()}`}{" "}
                <span>/</span>{" "}
                {new Date(now + "T12:00:00").toLocaleDateString("es-EC", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <h1>{titles[view]}</h1>
              <p>
                {view === "resumen"
                  ? "Construye tu bienestar, un día a la vez. Aquí puedes ver cómo vas."
                  : view === "metas"
                    ? "Define el destino y convierte tus objetivos en acciones."
                    : view === "registro"
                      ? "Registra tus hábitos con honestidad. Cada dato ayuda a conocerte mejor."
                      : view === "clientes"
                        ? "Revisa las metas de tus clientes asignados."
                        : "Consulta y corrige tus registros durante una meta activa."}
              </p>
            </div>
            {!trainer && (
              <button
                className="btn primary"
                onClick={() =>
                  open({ kind: active ? "record" : "propose", meta: active })
                }
              >
                <Plus size={17} />
                {active ? "Registrar mi día" : "Proponer meta"}
              </button>
            )}
          </div>
          {trainer && (
            <div className="client-selector">
              <Users size={17} />
              <label htmlFor="client">Cliente</label>
              <select
                id="client"
                value={client?.id ?? ""}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setGoalId("");
                }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="muted">Solo clientes asignados a ti</span>
            </div>
          )}
          {view !== "clientes" && goals.length > 1 && (
            <div className="goal-selector">
              <label htmlFor="goal-select">Meta consultada</label>
              <select
                id="goal-select"
                value={meta?.id ?? ""}
                onChange={(e) => setGoalId(e.target.value)}
              >
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {goalLabels[g.type]} · {g.status} · {nice(g.start_date)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {view === "resumen" &&
            (meta ? (
              <>
                <section className="goal-hero">
                  <div className="hero-content">
                    <span className="pill light">
                      <span />
                      {meta.status === "activa"
                        ? "META ACTIVA"
                        : meta.status === "cerrada"
                          ? "META CERRADA"
                          : meta.status === "cancelada"
                            ? "META CANCELADA"
                            : "PROPUESTA PENDIENTE"}
                    </span>
                    <h2>{goalLabels[meta.type]}</h2>
                    <p>
                      {meta.status === "propuesta"
                        ? "Tu entrenador revisará la propuesta y definirá los objetivos."
                        : "El progreso comienza con lo que haces cada día."}
                    </p>
                    <div className="hero-footer">
                      <span>
                        <CalendarDays size={15} />
                        {nice(meta.start_date)} — {nice(meta.end_date)}
                      </span>
                      <button onClick={() => setView("metas")}>
                        Ver mi plan <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="orbit o1" />
                    <div className="orbit o2" />
                    <div className="orbit o3" />
                    <Target size={108} strokeWidth={0.9} />
                    <span>✦</span>
                  </div>
                </section>
                {(meta.status === "activa" || meta.status === "cerrada") &&
                  result && (
                    <>
                      <div className="section-line">
                        <div>
                          <h2>
                            {wholePeriod
                              ? "Tu meta, en hábitos"
                              : "Tu semana, en hábitos"}
                          </h2>
                          <p>
                            El cumplimiento refleja tus registros, no un
                            resultado físico.
                          </p>
                        </div>
                        <div className="period-controls">
                          <select
                            aria-label="Periodo de seguimiento"
                            value={wholePeriod ? "meta" : "semana"}
                            onChange={(e) =>
                              setWholePeriod(e.target.value === "meta")
                            }
                          >
                            <option value="semana">Por semana</option>
                            <option value="meta">Meta completa</option>
                          </select>
                          {!wholePeriod && (
                            <div className="week-picker">
                              <button
                                aria-label="Semana anterior"
                                onClick={() => setWeek(week - 1)}
                              >
                                <ChevronLeft size={15} />
                              </button>
                              <span>
                                {nice(from)} – {nice(to)}
                              </span>
                              <button
                                aria-label="Semana siguiente"
                                disabled={week >= 0}
                                onClick={() => setWeek(week + 1)}
                              >
                                <ChevronRight size={15} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="stat-grid">
                        {result.metrics.map((m, index) => {
                          const Icon = {
                            exercise: Dumbbell,
                            food: Leaf,
                            sleep: Moon,
                          }[m.key];
                          return (
                            <article
                              className={"stat-card tone-" + index}
                              key={m.key}
                            >
                              <div className="stat-top">
                                <span className="stat-icon">
                                  <Icon size={21} />
                                </span>
                                <span className="micro-tag">
                                  {m.covered}/{result.eligible} días con datos
                                </span>
                              </div>
                              <div className="stat-number">
                                {fmt(m.percent)}
                                <span>{m.percent === null ? "" : "%"}</span>
                              </div>
                              <h3>{m.label}</h3>
                              <div className="track">
                                <span
                                  style={{ width: (m.percent ?? 0) + "%" }}
                                />
                              </div>
                              <div className="stat-bottom">
                                <span>
                                  {m.covered
                                    ? `${m.valid} días válidos`
                                    : "Sin información"}
                                </span>
                                <span>Objetivo {fmt(m.target)}</span>
                              </div>
                            </article>
                          );
                        })}
                        <article className="stat-card overall">
                          <div className="stat-top">
                            <span className="stat-icon">
                              <Flame size={21} />
                            </span>
                            <span className="micro-tag">PROMEDIO</span>
                          </div>
                          <div className="stat-number">
                            {fmt(result.combined)}
                            <span>{result.combined === null ? "" : "%"}</span>
                          </div>
                          <h3>Cumplimiento conjunto</h3>
                          <div className="track">
                            <span
                              style={{ width: (result.combined ?? 0) + "%" }}
                            />
                          </div>
                          <div className="stat-bottom">
                            <span>
                              {!result.eligible
                                ? "Sin días elegibles"
                                : result.provisional
                                  ? "Resultado provisional"
                                  : "Periodo completo"}
                            </span>
                            <TrendingUp size={14} />
                          </div>
                        </article>
                      </div>
                      <div className="dashboard-columns">
                        <section className="panel">
                          <div className="panel-title">
                            <div>
                              <h2>Más cerca de tu meta</h2>
                              <p>Tus indicadores, cada uno a su ritmo.</p>
                            </div>
                            <TrendingUp size={19} color="#8fa078" />
                          </div>
                          {result.indicators.map((i) => (
                            <IndicatorView
                              key={i.id}
                              indicator={i}
                              state={state}
                              end={to}
                              now={now}
                            />
                          ))}
                        </section>
                        <section className="panel coach-panel">
                          <div className="panel-title">
                            <h2>Tu entrenador te acompaña</h2>
                            <span className="live-dot" />
                          </div>
                          <div className="coach-person">
                            <span className="avatar">
                              {initials(
                                state.usuarios.find(
                                  (u) => u.id === client?.trainer_id,
                                )?.name ?? "Entrenador",
                              )}
                            </span>
                            <div>
                              <strong>
                                {state.usuarios.find(
                                  (u) => u.id === client?.trainer_id,
                                )?.name ?? "Entrenador asignado"}
                              </strong>
                              <small>Observación vigente</small>
                            </div>
                          </div>
                          <blockquote>
                            “
                            {meta.observation ||
                              "Todavía no hay una observación. Tu entrenador podrá dejarte un comentario sobre el seguimiento."}
                            ”
                          </blockquote>
                          <div className="coach-date">
                            {meta.observation_at
                              ? "Actualizada el " +
                                new Date(
                                  meta.observation_at,
                                ).toLocaleDateString("es-EC")
                              : "Pendiente de revisión"}
                            {trainer && meta.status !== "cerrada" && (
                              <button
                                onClick={() => open({ kind: "observe", meta })}
                              >
                                <Pencil size={13} />
                                Editar
                              </button>
                            )}
                          </div>
                          <div className="coach-note">
                            <Leaf size={18} />
                            <p>
                              Cumplir hábitos y lograr cambios físicos son
                              resultados diferentes. Valora ambos por separado.
                            </p>
                          </div>
                        </section>
                      </div>
                      <section className="panel recent">
                        <div className="panel-title">
                          <div>
                            <h2>Pequeños pasos, grandes avances</h2>
                            <p>Tus últimos registros</p>
                          </div>
                          <button
                            className="text-link"
                            onClick={() => setView("historial")}
                          >
                            Ver historial <ArrowRight size={15} />
                          </button>
                        </div>
                        <Records
                          records={records.slice(0, 4)}
                          indicators={indicators}
                          editable={false}
                          onEdit={edit}
                          onDelete={remove}
                        />
                      </section>
                    </>
                  )}
              </>
            ) : (
              <Empty
                icon={<Target />}
                title="Tu siguiente paso empieza aquí"
                text={
                  trainer
                    ? "Este cliente aún no ha propuesto una meta."
                    : "Propón una meta para que tu entrenador configure los objetivos."
                }
                action={
                  !trainer ? (
                    <button
                      className="btn primary"
                      onClick={() => open({ kind: "propose" })}
                    >
                      <Plus size={16} />
                      Proponer mi primera meta
                    </button>
                  ) : undefined
                }
              />
            ))}
          {view === "metas" && (
            <>
              <div className="section-line">
                <h2>Plan de seguimiento</h2>
                {!trainer && (
                  <button
                    className="btn secondary"
                    onClick={() => open({ kind: "propose" })}
                  >
                    <Plus size={15} />
                    Nueva propuesta
                  </button>
                )}
              </div>
              {goals.map((g) => (
                <section className="panel goal-detail" key={g.id}>
                  <div className="goal-detail-heading">
                    <span className="goal-icon">
                      <Target size={24} />
                    </span>
                    <div>
                      <h2>{goalLabels[g.type]}</h2>
                      <p>
                        {nice(g.start_date)} — {nice(g.end_date)} ·{" "}
                        {client?.name}
                      </p>
                    </div>
                    <span className={"status " + g.status}>{g.status}</span>
                  </div>
                  {(g.reported_weight_kg != null || g.goal_details) && (
                    <div className="notice">
                      {g.reported_weight_kg != null && (
                        <strong>
                          Peso reportado al proponer la meta:{" "}
                          {g.reported_weight_kg} kg
                        </strong>
                      )}
                      {g.goal_details && <p>{g.goal_details}</p>}
                    </div>
                  )}
                  {(g.status === "activa" || g.status === "cerrada") && (
                    <>
                      <div className="objective-grid">
                        {[
                          {
                            Icon: Dumbbell,
                            label: "Ejercicio",
                            value: g.exercise_days + " días / semana",
                          },
                          {
                            Icon: Leaf,
                            label: "Alimentación",
                            value: g.food_days + " días / semana",
                          },
                          {
                            Icon: Moon,
                            label: "Sueño",
                            value:
                              g.sleep_days +
                              " días · " +
                              g.sleep_min +
                              "–" +
                              g.sleep_max +
                              " h por noche",
                          },
                        ].map(({ Icon, label, value }) => (
                          <div key={label}>
                            <Icon size={19} />
                            <small>{label}</small>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                      {!!g.training_plan?.length && (
                        <div className="indicator-list">
                          <h3>Rutina semanal</h3>
                          <p>
                            {g.training_plan.length} días de entrenamiento ·{" "}
                            {g.training_plan.reduce(
                              (total, session) => total + session.minutes,
                              0,
                            )}{" "}
                            min por semana
                          </p>
                          {g.training_plan.map((session) => (
                            <div key={session.day}>
                              <span>
                                <strong>{session.day}</strong>
                                <small>{session.groups.join(" · ")}</small>
                              </span>
                              <strong>{session.minutes} min</strong>
                            </div>
                          ))}
                        </div>
                      )}
                      {g.observation && (
                        <p className="notice">
                          <strong>Comentario del entrenador: </strong>
                          {g.observation}
                        </p>
                      )}
                      <div className="indicator-list">
                        {state.indicadores
                          .filter((i) => i.meta_id === g.id)
                          .map((i) => (
                            <div key={i.id}>
                              <span>
                                <strong>{i.name}</strong>
                                <small>
                                  {kindLabels[i.kind]}
                                  {i.kind === "FUERZA"
                                    ? " · " +
                                      i.reps +
                                      " reps · " +
                                      i.equipment +
                                      " · " +
                                      i.technique
                                    : ""}
                                </small>
                              </span>
                              <span>
                                {i.initial} →{" "}
                                <strong>
                                  {i.target} {i.unit}
                                </strong>
                              </span>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                  {g.status === "propuesta" && (
                    <p className="proposal-note">
                      Propuesta pendiente. El entrenador debe definir los tres
                      objetivos y al menos un indicador compatible antes de
                      activarla.
                    </p>
                  )}
                  <div className="goal-actions">
                    {trainer && g.status === "propuesta" && (
                      <button
                        className="btn primary"
                        onClick={() => open({ kind: "activate", meta: g })}
                      >
                        Configurar y activar <ArrowRight size={16} />
                      </button>
                    )}
                    {trainer &&
                      (g.status === "activa" || g.status === "propuesta") && (
                        <>
                          <button
                            className="btn secondary"
                            onClick={() => open({ kind: "observe", meta: g })}
                          >
                            <Pencil size={15} />
                            Observación
                          </button>
                          <button
                            className="btn subtle"
                            onClick={() => open({ kind: "close", meta: g })}
                          >
                            {g.start_date > now
                              ? "Cancelar antes del inicio"
                              : g.status === "propuesta"
                                ? "Cerrar propuesta"
                                : "Cerrar meta"}
                          </button>
                        </>
                      )}
                    {(g.status === "cerrada" || g.status === "cancelada") && (
                      <span className="muted">
                        <ShieldCheck size={14} />
                        Historial de solo lectura
                      </span>
                    )}
                  </div>
                </section>
              ))}
              {!goals.length && (
                <Empty
                  icon={<Target />}
                  title="Aún no hay metas"
                  text="La primera meta la propone el cliente."
                />
              )}
            </>
          )}
          {view === "registro" &&
            (meta?.status === "activa" ? (
              <>
                <section className="panel record-intro">
                  <div>
                    <span className="eyebrow">META ACTIVA</span>
                    <h2>{goalLabels[meta.type]}</h2>
                    <p>Selecciona una categoría para registrar tus datos.</p>
                  </div>
                  <span className="pill">
                    {trainer
                      ? "Consulta del entrenador"
                      : "Registro del cliente"}
                  </span>
                </section>
                <div className="category-grid">
                  {[
                    {
                      Icon: Dumbbell,
                      label: "Ejercicio",
                      desc: "Series, repeticiones y carga",
                      action: "exercise",
                    },
                    {
                      Icon: Leaf,
                      label: "Alimentación",
                      desc: "Comidas y declaración del plan",
                      action: "food",
                    },
                    {
                      Icon: Moon,
                      label: "Sueño",
                      desc: "Inicio y fin del descanso",
                      action: "sleep",
                    },
                    {
                      Icon: TrendingUp,
                      label: "Medición",
                      desc: "Evolución de tus indicadores",
                      action: "measurement",
                    },
                    {
                      Icon: ClipboardList,
                      label: "Sustancias",
                      desc: "Opcional · No afecta el cumplimiento",
                      action: "substance",
                    },
                  ].map(({ Icon, label, desc, action }) => (
                    <button
                      className="category-card"
                      disabled={trainer}
                      key={action}
                      onClick={() =>
                        open({ kind: "record", meta, record: { action } })
                      }
                    >
                      <span className="category-icon">
                        <Icon size={25} />
                      </span>
                      <h3>{label}</h3>
                      <p>{desc}</p>
                      <span className="category-action">
                        Registrar <Plus size={17} />
                      </span>
                    </button>
                  ))}
                </div>
                {trainer && (
                  <div className="notice">
                    <ShieldCheck size={18} />
                    Los registros pertenecen al cliente. El entrenador puede
                    consultarlos y actualizar su observación.
                  </div>
                )}
                <section className="panel recent">
                  <div className="panel-title">
                    <h2>Últimos registros</h2>
                  </div>
                  <Records
                    records={records.slice(0, 10)}
                    indicators={indicators}
                    editable={!trainer}
                    onEdit={edit}
                    onDelete={remove}
                  />
                </section>
              </>
            ) : (
              <Empty
                icon={<ClipboardList />}
                title="Necesitas una meta activa"
                text="Selecciona o configura una meta activa para registrar hábitos."
                action={
                  <button
                    className="btn primary"
                    onClick={() => setView("metas")}
                  >
                    Ver metas <ArrowRight size={15} />
                  </button>
                }
              />
            ))}
          {view === "historial" && (
            <section className="panel">
              <div className="history-tools">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    placeholder="Buscar en los registros…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Buscar registros"
                  />
                </div>
                <select
                  aria-label="Filtrar categoría"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="todos">Todas las categorías</option>
                  {Object.entries(tableNames).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <span className="muted">{records.length} registros</span>
              </div>
              <Records
                records={records.filter(
                  (r) =>
                    (filter === "todos" || r.table === filter) &&
                    JSON.stringify(r)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )}
                indicators={indicators}
                editable={!trainer && meta?.status === "activa"}
                onEdit={edit}
                onDelete={remove}
              />
            </section>
          )}
          {view === "clientes" && (
            <div className="clients-grid">
              {clients.map((c) => {
                const g = state.metas.find(
                  (m) => m.client_id === c.id && m.status === "activa",
                );
                return (
                  <section className="panel client-card" key={c.id}>
                    <span className="avatar large">{initials(c.name)}</span>
                    <h2>{c.name}</h2>
                    <p>{g ? goalLabels[g.type] : "Sin meta activa"}</p>
                    <span className={"status " + (g ? "activa" : "propuesta")}>
                      {g ? "En seguimiento" : "Pendiente"}
                    </span>
                    <button
                      className="btn secondary"
                      onClick={() => {
                        setClientId(c.id);
                        setGoalId("");
                        setView("resumen");
                      }}
                    >
                      Ver seguimiento <ArrowRight size={16} />
                    </button>
                  </section>
                );
              })}
              {!clients.length && (
                <Empty
                  icon={<Users />}
                  title="Sin clientes asignados"
                  text="El administrador debe asignarte clientes en Supabase."
                />
              )}
            </div>
          )}
          <footer className="footer">
            <span className="footer-brand">ritmo.</span>
            <span>El bienestar es un proceso. Hazlo a tu ritmo.</span>
            <span>Proyecto de Miguel Andrés Punin</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCheck size={19} />
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <ModalView
          modal={modal}
          user={user}
          state={state}
          now={now}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setModal(null);
              setError("");
            }
          }}
          onSubmit={mutate}
          onReset={() =>
            session({ action: "demo", role: user.role, reset: true })
          }
        />
      )}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <section className="empty panel">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </section>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Login({
  configured,
  busy,
  error,
  onSession,
}: {
  configured: boolean;
  busy: boolean;
  error: string;
  onSession: (x: unknown) => void;
}) {
  return (
    <div className="login-page">
      <section className="login-story">
        <a className="brand" href="#">
          <span className="brand-mark">
            <Activity />
          </span>
          ritmo<span className="brand-dot">.</span>
        </a>
        <div className="login-copy">
          <span className="eyebrow">TU BIENESTAR, A TU RITMO</span>
          <h1>
            Los grandes cambios
            <br />
            empiezan con
            <br />
            <em>pequeños hábitos.</em>
          </h1>
          <p>
            Un espacio para registrar tu día, seguir tus metas y avanzar con el
            acompañamiento de tu entrenador.
          </p>
          <div className="login-chips">
            <span>
              <Dumbbell size={17} />
              Muévete
            </span>
            <span>
              <Leaf size={17} />
              Aliméntate
            </span>
            <span>
              <Moon size={17} />
              Descansa
            </span>
          </div>
        </div>
        <div className="login-bottom">
          <span>✦</span>Cada día es una nueva oportunidad.
        </div>
        <div className="login-orbits" aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
      </section>
      <section className="login-form">
        <div className="login-form-inner">
          <span className="pill">SEGUIMIENTO DE METAS Y HÁBITOS</span>
          <h2>Qué bueno verte.</h2>
          <p>Ingresa a tu espacio y continúa tu proceso.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onSession({
                action: "login",
                email: f.get("email"),
                password: f.get("password"),
              });
            }}
          >
            <Field label="Correo electrónico">
              <input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="tu@correo.com"
                required
              />
            </Field>
            <Field label="Contraseña">
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Tu contraseña"
                required
              />
            </Field>
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            <button className="btn primary full" disabled={busy || !configured}>
              {busy ? "Ingresando…" : "Iniciar sesión"}
              <ArrowRight size={17} />
            </button>
            {!configured && (
              <p className="setup-note">
                La conexión con Supabase está pendiente. Mientras tanto, explora
                la demostración con datos ficticios.
              </p>
            )}
          </form>
          {!configured && (
            <>
              <div className="login-divider">
                <span>CONOCE CÓMO FUNCIONA</span>
              </div>
              <div className="demo-options">
                <button
                  disabled={busy}
                  onClick={() => onSession({ action: "demo", role: "cliente" })}
                >
                  <span className="demo-option-icon">
                    <Activity size={22} />
                  </span>
                  <strong>Entrar como cliente</strong>
                  <small>Registra y consulta tus hábitos</small>
                  <ArrowUpRight size={18} />
                </button>
                <button
                  disabled={busy}
                  onClick={() => onSession({ action: "demo", role: "entrenador" })}
                >
                  <span className="demo-option-icon trainer">
                    <Users size={22} />
                  </span>
                  <strong>Entrar como entrenador</strong>
                  <small>Configura metas y acompaña</small>
                  <ArrowUpRight size={18} />
                </button>
              </div>
              <p className="login-caption">
                <ShieldCheck size={15} />
                Datos ficticios · Cambios privados de esta sesión por 8 horas
              </p>
            </>
          )}
        </div>
        <div className="login-credit">Ingeniería Web · Miguel Andrés Punin</div>
      </section>
    </div>
  );
}
function Records({
  records,
  indicators,
  editable,
  onEdit,
  onDelete,
}: {
  records: Row[];
  indicators: Indicador[];
  editable: boolean;
  onEdit: (r: Row) => void;
  onDelete: (r: Row) => void;
}) {
  if (!records.length)
    return (
      <p className="empty-small">
        No hay registros para mostrar. Tus próximos pasos aparecerán aquí.
      </p>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>ACTIVIDAD</th>
            <th>FECHA</th>
            <th>DETALLE</th>
            <th>ESTADO</th>
            {editable && <th>ACCIONES</th>}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const Icon =
              r.table === "ejercicios"
                ? Dumbbell
                : r.table === "alimentos"
                  ? Leaf
                  : r.table === "suenos"
                    ? Moon
                    : r.table === "mediciones"
                      ? TrendingUp
                      : ClipboardList;
            const i = indicators.find((i) => i.id === r.indicator_id);
            return (
              <tr key={r.id}>
                <td>
                  <div className="table-activity">
                    <span className={"row-icon " + r.table}>
                      <Icon size={17} />
                    </span>
                    <strong>
                      {r.table === "alimentos"
                        ? r.kind === "declaracion"
                          ? "Plan diario"
                          : "Comida"
                        : r.table === "suenos"
                          ? "Descanso"
                          : r.table === "mediciones"
                            ? (i?.name ?? "Indicador")
                            : r.name}
                    </strong>
                  </div>
                </td>
                <td>
                  {nice(r.date)}
                  {r.time ? ` · ${String(r.time).slice(0, 5)}` : ""}
                </td>
                <td>
                  {r.table === "ejercicios"
                    ? `${r.series} series × ${r.reps} reps · ${r.weight} kg`
                    : r.table === "alimentos"
                      ? r.kind === "declaracion"
                        ? r.complete
                          ? "Plan completo"
                          : "Plan no cumplido"
                        : r.meal
                      : r.table === "suenos"
                        ? `${fmt(hours(r.start, r.end))} horas`
                        : r.table === "mediciones"
                          ? `${r.value} ${i?.unit ?? ""}`
                          : r.amount}
                </td>
                <td>
                  <span className="record-tag">
                    {r.table === "alimentos" &&
                    r.kind === "declaracion" &&
                    !r.complete
                      ? "Declarado"
                      : r.table === "ejercicios" && !r.performed
                        ? "No realizado"
                        : "Registrado"}
                  </span>
                </td>
                {editable && (
                  <td>
                    <div className="row-actions">
                      <button
                        aria-label="Editar registro"
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        aria-label="Eliminar registro"
                        onClick={() => onDelete(r)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function IndicatorView({
  indicator: i,
  state,
  end,
  now,
}: {
  indicator: ReturnType<typeof evaluate>["indicators"][number];
  state: State;
  end: string;
  now: string;
}) {
  const points = state.mediciones
    .filter((m) => m.indicator_id === i.id && m.date <= end && m.date <= now)
    .sort((a, b) => a.date.localeCompare(b.date));
  const values = points.map((m) => m.value),
    min = Math.min(i.initial, i.target, ...values),
    max = Math.max(i.initial, i.target, ...values);
  const coords = values.map(
    (v, n) =>
      `${30 + (n / Math.max(1, values.length - 1)) * 470},${112 - ((v - min) / (max - min || 1)) * 80}`,
  );
  return (
    <div className="indicator-view">
      <div className="indicator-heading">
        <strong>{i.name}</strong>
        <span className="pill">
          {i.percent == null
            ? "Sin medición"
            : fmt(i.percent) + " % de progreso"}
        </span>
      </div>
      <div className="indicator-values">
        <div>
          <small>{i.kind === "PESO" ? "PESO INICIAL" : "INICIAL"}</small>
          <span>
            {i.initial}
            <em>{i.unit}</em>
          </span>
        </div>
        <div className="current">
          <small>
            {i.kind === "PESO" ? "ÚLTIMO PESO REGISTRADO" : "ACTUAL"}
          </small>
          <span>
            {i.current == null ? "Sin registro" : fmt(i.current)}
            {i.current != null && <em>{i.unit}</em>}
          </span>
        </div>
        <div>
          <small>OBJETIVO</small>
          <span>
            {i.target}
            <em>{i.unit}</em>
          </span>
        </div>
      </div>
      {values.length ? (
        <svg
          className="sparkline"
          viewBox="0 0 530 145"
          role="img"
          aria-label={"Historial de " + i.name}
        >
          <defs>
            <linearGradient id={"fade-" + i.id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b5d66a" stopOpacity=".35" />
              <stop offset="100%" stopColor="#b5d66a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[30, 70, 112].map((y) => (
            <line
              key={y}
              x1="20"
              y1={y}
              x2="510"
              y2={y}
              stroke="#edf0e9"
              strokeDasharray="4 5"
            />
          ))}
          <polygon
            points={`30,130 ${coords.join(" ")} ${coords.at(-1)?.split(",")[0]},130`}
            fill={`url(#fade-${i.id})`}
          />
          <polyline
            points={coords.join(" ")}
            fill="none"
            stroke="#709c35"
            strokeWidth="2.5"
          />
          {coords.map((c, n) => (
            <circle
              key={n}
              cx={c.split(",")[0]}
              cy={c.split(",")[1]}
              r="4"
              fill="#709c35"
              stroke="white"
              strokeWidth="2"
            />
          ))}
          <text x="28" y="142" fill="#8b9288" fontSize="10">
            {nice(points[0].date)}
          </text>
          <text x="500" y="142" textAnchor="end" fill="#8b9288" fontSize="10">
            {nice(points.at(-1)!.date)}
          </text>
        </svg>
      ) : (
        <div className="indicator-track">
          <div className="track">
            <span style={{ width: (i.percent ?? 0) + "%" }} />
          </div>
          <p>
            {i.kind === "SEMANAS_CUMPLIDAS"
              ? "Calculado a partir de semanas completas con datos suficientes."
              : "Registra una medición para empezar a ver tu evolución."}
          </p>
        </div>
      )}
      <div className="indicator-note">
        <span className="tiny-dot" />
        {i.kind === "SEMANAS_CUMPLIDAS"
          ? "Indicador calculado automáticamente"
          : i.date
            ? "Última medición: " + nice(i.date)
            : "Sin medición"}
        {i.kind === "FUERZA" && (
          <span>
            {i.reps} reps · {i.equipment}
          </span>
        )}
      </div>
    </div>
  );
}
function ModalView({
  modal: m,
  user,
  state,
  now,
  busy,
  error,
  onClose,
  onSubmit,
  onReset,
}: {
  modal: Modal;
  user: Usuario;
  state: State;
  now: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (p: unknown) => void;
  onReset: () => void;
}) {
  const meta = m.meta,
    r = m.record;
  const closeMax = meta && meta.end_date < now ? meta.end_date : now;
  const closeBeforeStart =
    m.kind === "close" && !!meta && meta.start_date > closeMax;
  const [category, setCategory] = useState(
      String(r?.action ?? (m.table ? actions[m.table] : "exercise")),
    ),
    [foodKind, setFoodKind] = useState(String(r?.kind ?? "declaracion"));
  const allowed: IndicatorKind[] =
    meta?.type === "MANTENER_HABITOS"
      ? ["SEMANAS_CUMPLIDAS"]
      : meta?.type === "MEJORAR_FUERZA"
        ? ["FUERZA"]
        : ["PESO", "PERIMETRO"];
  const [routine, setRoutine] = useState<NonNullable<Meta["training_plan"]>>(
    [],
  );
  const [routineError, setRoutineError] = useState("");
  const totalMinutes = routine.reduce(
    (total, session) => total + session.minutes,
    0,
  );
  const blank = () => ({
    kind: allowed[0],
    name:
      allowed[0] === "SEMANAS_CUMPLIDAS"
        ? "Semanas cumplidas"
        : allowed[0] === "FUERZA"
          ? ""
          : "Peso corporal",
    unit: allowed[0] === "SEMANAS_CUMPLIDAS" ? "semanas" : "kg",
    initial:
      allowed[0] === "SEMANAS_CUMPLIDAS"
        ? "0"
        : allowed[0] === "PESO"
          ? String(meta?.reported_weight_kg ?? "")
          : "",
    target: "",
    exercise: "",
    technique: "",
    equipment: "",
    reps: "",
  });
  const [inds, setInds] = useState([blank()]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = old;
    };
  }, [onClose]);
  const titles = {
    propose: "Propón tu siguiente meta",
    activate: "Configura el plan de seguimiento",
    close: closeBeforeStart ? "Cancelar meta programada" : "Cerrar meta",
    observe: "Observación del entrenador",
    record: r?.id ? "Corregir registro" : "Un paso más en tu día",
    delete: "Eliminar registro",
    help: "Tu guía para avanzar",
    reset: "Reiniciar la demostración",
  };
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (m.kind === "reset") return onReset();
    if (m.kind === "propose") return onSubmit({ ...f, action: "propose" });
    if (m.kind === "activate") {
      if (
        !routine.length ||
        routine.some((session) => !session.minutes || !session.groups.length)
      ) {
        setRoutineError(
          "Selecciona al menos un día e indica los minutos y grupos musculares de cada sesión.",
        );
        return;
      }
      setRoutineError("");
      return onSubmit({
        ...f,
        action: "activate",
        meta_id: meta!.id,
        indicators: inds,
        exercise_days: routine.length,
        training_plan: trainingDays.flatMap((day) =>
          routine.filter((session) => session.day === day),
        ),
      });
    }
    if (m.kind === "close" && closeBeforeStart)
      return onSubmit({ action: "cancel", meta_id: meta!.id });
    if (m.kind === "close" || m.kind === "observe")
      return onSubmit({ ...f, action: m.kind, meta_id: meta!.id });
    if (m.kind === "delete")
      return onSubmit({
        action: "delete",
        meta_id: meta!.id,
        id: r!.id,
        table: m.table,
      });
    if (m.kind === "record") {
      const p: Row = {
        ...f,
        action: category,
        meta_id: meta!.id,
        ...(r?.id ? { id: r.id } : {}),
      };
      if (category === "exercise") p.performed = f.performed === "true";
      if (category === "food") {
        p.kind = foodKind;
        p.complete = f.complete === "true";
        p.meal = f.meal ?? "";
      }
      if (category === "sleep") {
        p.start = new Date(String(f.start)).toISOString();
        p.end = new Date(String(f.end)).toISOString();
      }
      onSubmit(p);
    }
  }
  const local = (v: unknown) =>
    v
      ? new Date(
          Date.parse(String(v)) -
            new Date(String(v)).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "";
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={"modal " + (m.kind === "activate" ? "wide" : "")}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">RITMO · SEGUIMIENTO</span>
            <h2 id="modal-title">{titles[m.kind]}</h2>
          </div>
          <button
            autoFocus
            aria-label="Cerrar ventana"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-content">
            {m.kind === "help" && (
              <div className="guide">
                <p>
                  Cliente y entrenador trabajan juntos, con permisos distintos.
                </p>
                <h3>1. Define el destino</h3>
                <p>
                  El cliente propone una meta. El entrenador configura objetivos
                  de ejercicio, alimentación y sueño, añade indicadores y activa
                  el plan.
                </p>
                <h3>2. Registra con constancia</h3>
                <p>
                  El cliente registra hábitos y mediciones. Alimentación cuenta
                  mediante una declaración diaria del plan completo. Sueño suma
                  los descansos por fecha local de finalización.
                </p>
                <h3>3. Consulta y acompaña</h3>
                <p>
                  El panel separa cumplimiento, cobertura de datos y progreso
                  físico. Sin datos suficientes, los resultados son
                  provisionales.
                </p>
                <h3>Reglas importantes</h3>
                <p>
                  Una sola meta activa por cliente. Los objetivos activos no se
                  editan. Las metas cerradas quedan en consulta. Sustancias es
                  opcional y no puntúa.
                </p>
                <div className="notice">
                  La demostración usa datos ficticios y conserva cambios en este
                  navegador durante 8 horas. No ingreses información personal
                  real. Para almacenamiento permanente, configura Supabase.
                </div>
              </div>
            )}
            {m.kind === "reset" && (
              <p>
                Se eliminarán los cambios de esta demostración y se volverán a
                cargar los datos ficticios iniciales.
              </p>
            )}
            {m.kind === "delete" && (
              <p>
                Se eliminará este registro de{" "}
                {tableNames[m.table!]?.toLowerCase()}. Los resultados se
                recalcularán con los datos restantes.
              </p>
            )}
            {m.kind === "propose" && (
              <>
                <p className="form-intro">
                  Elige tu objetivo principal. Tu entrenador definirá los
                  indicadores y los días de hábitos.
                </p>
                <Field label="¿Qué quieres lograr?">
                  <select name="type" required>
                    {Object.entries(goalLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="¿Cuánto pesas actualmente? (kg)">
                  <input
                    name="reported_weight_kg"
                    type="number"
                    min="20"
                    max="500"
                    step="any"
                    required
                  />
                </Field>
                <Field label="¿Qué quieres conseguir? ¿Hay algo que tu entrenador deba saber?">
                  <textarea
                    name="goal_details"
                    maxLength={1000}
                    rows={3}
                    placeholder="Ej. Quiero ganar masa muscular y puedo entrenar por las tardes."
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Fecha de inicio">
                    <input
                      name="start_date"
                      type="date"
                      defaultValue={now}
                      required
                    />
                  </Field>
                  <Field label="Fecha de fin propuesta">
                    <input
                      name="end_date"
                      type="date"
                      defaultValue={addDays(now, 55)}
                      required
                    />
                  </Field>
                </div>
              </>
            )}
            {m.kind === "activate" && (
              <>
                <p className="form-intro">
                  {goalLabels[meta!.type]} · Los objetivos se bloquean al
                  activar la meta.
                </p>
                <div className="form-grid">
                  <Field label="Inicio">
                    <input
                      name="start_date"
                      type="date"
                      defaultValue={meta!.start_date}
                      required
                    />
                  </Field>
                  <Field label="Fin previsto">
                    <input
                      name="end_date"
                      type="date"
                      defaultValue={meta!.end_date}
                      required
                    />
                  </Field>
                </div>
                <div className="notice">
                  <strong>Peso reportado por el cliente:</strong>{" "}
                  {meta!.reported_weight_kg == null
                    ? "Sin dato en esta propuesta"
                    : `${meta!.reported_weight_kg} kg`}
                  {meta!.goal_details && <p>{meta!.goal_details}</p>}
                </div>
                <h3 className="form-section">Rutina semanal</h3>
                <p>
                  Marca los días de entrenamiento. Indica cuánto dura cada
                  sesión y qué grupos se trabajan.
                </p>
                <p>
                  <strong>
                    {routine.length} días por semana · {fmt(totalMinutes / 60)}{" "}
                    h en total ({totalMinutes} min)
                  </strong>
                </p>
                {trainingDays.map((day) => {
                  const session = routine.find((entry) => entry.day === day);
                  return (
                    <fieldset className="indicator-form" key={day}>
                      <legend>
                        <label>
                          <input
                            type="checkbox"
                            checked={!!session}
                            onChange={(e) =>
                              setRoutine(
                                e.target.checked
                                  ? [
                                      ...routine,
                                      { day, minutes: 0, groups: [] },
                                    ]
                                  : routine.filter(
                                      (entry) => entry.day !== day,
                                    ),
                              )
                            }
                          />{" "}
                          {day}
                        </label>
                      </legend>
                      {session && (
                        <>
                          <Field label="Duración de esta sesión (minutos)">
                            <input
                              type="number"
                              min="1"
                              max="1440"
                              step="1"
                              required
                              value={session.minutes || ""}
                              placeholder="Ej. 60"
                              onChange={(e) =>
                                setRoutine(
                                  routine.map((entry) =>
                                    entry.day === day
                                      ? {
                                          ...entry,
                                          minutes: Number(e.target.value),
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px 16px",
                            }}
                          >
                            {muscleGroups.map((group) => (
                              <label key={group}>
                                <input
                                  type="checkbox"
                                  checked={session.groups.includes(group)}
                                  onChange={(e) =>
                                    setRoutine(
                                      routine.map((entry) =>
                                        entry.day === day
                                          ? {
                                              ...entry,
                                              groups: e.target.checked
                                                ? [...entry.groups, group]
                                                : entry.groups.filter(
                                                    (name) => name !== group,
                                                  ),
                                            }
                                          : entry,
                                      ),
                                    )
                                  }
                                />{" "}
                                {group}
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </fieldset>
                  );
                })}
                {routineError && (
                  <p role="alert" className="notice">
                    {routineError}
                  </p>
                )}
                <Field label="Comentario del entrenador al aceptar la meta">
                  <textarea
                    name="observation"
                    maxLength={2000}
                    rows={3}
                    placeholder="Explica al cliente cómo empezar y qué debe tener en cuenta."
                  />
                </Field>
                <h3 className="form-section">Alimentación y descanso</h3>
                <div className="form-grid three">
                  {[
                    ["food_days", "Alimentación · días por semana", 6],
                    ["sleep_days", "Sueño · días por semana", 5],
                  ].map(([name, label, value]) => (
                    <Field key={String(name)} label={String(label)}>
                      <input
                        name={String(name)}
                        type="number"
                        min="1"
                        max="7"
                        step="1"
                        defaultValue={value}
                        required
                      />
                    </Field>
                  ))}
                </div>
                <div className="form-grid">
                  <Field label="Mínimo de sueño por noche (horas)">
                    <input
                      name="sleep_min"
                      type="number"
                      min="0.1"
                      max="24"
                      step="0.1"
                      defaultValue="7"
                      required
                    />
                  </Field>
                  <Field label="Máximo de sueño por noche (horas)">
                    <input
                      name="sleep_max"
                      type="number"
                      min="0.1"
                      max="24"
                      step="0.1"
                      defaultValue="9"
                      required
                    />
                  </Field>
                </div>
                <div className="section-line">
                  <h3>Indicadores de progreso</h3>
                  <button
                    type="button"
                    className="text-link"
                    disabled={inds.length >= 6}
                    onClick={() => setInds([...inds, blank()])}
                  >
                    <Plus size={15} />
                    Añadir
                  </button>
                </div>
                {inds.map((i, index) => (
                  <div className="indicator-form" key={index}>
                    <div className="indicator-form-heading">
                      <strong>Indicador {index + 1}</strong>
                      {inds.length > 1 && (
                        <button
                          type="button"
                          aria-label="Quitar indicador"
                          onClick={() =>
                            setInds(inds.filter((_, n) => n !== index))
                          }
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <div className="form-grid">
                      {[
                        "kind",
                        "name",
                        "unit",
                        "initial",
                        "target",
                        ...(i.kind === "FUERZA"
                          ? ["exercise", "technique", "equipment", "reps"]
                          : []),
                      ].map((key) => {
                        const k = key as keyof typeof i;
                        const labels: Record<string, string> = {
                          kind: "Tipo",
                          name: "Nombre",
                          unit: "Unidad",
                          initial:
                            i.kind === "PESO"
                              ? meta!.reported_weight_kg != null
                                ? "Peso inicial reportado por el cliente (kg)"
                                : "Peso inicial confirmado con el cliente (kg)"
                              : "Valor inicial medido",
                          target:
                            i.kind === "PESO"
                              ? "Peso objetivo acordado (kg)"
                              : "Valor objetivo acordado",
                          exercise: "Ejercicio",
                          technique: "Técnica",
                          equipment: "Equipo",
                          reps: "Repeticiones",
                        };
                        return (
                          <Field key={k} label={labels[k]}>
                            {k === "kind" ? (
                              <select
                                value={i.kind}
                                onChange={(e) => {
                                  const kind = e.target.value as IndicatorKind;
                                  setInds(
                                    inds.map((r, n) =>
                                      n === index
                                        ? {
                                            ...r,
                                            kind,
                                            name:
                                              kind === "PESO"
                                                ? "Peso corporal"
                                                : kind === "PERIMETRO"
                                                  ? "Perímetro corporal"
                                                  : r.name,
                                            initial:
                                              kind === "PESO"
                                                ? String(
                                                    meta!.reported_weight_kg ??
                                                      "",
                                                  )
                                                : "",
                                            target: "",
                                            unit:
                                              kind === "SEMANAS_CUMPLIDAS"
                                                ? "semanas"
                                                : kind === "PERIMETRO"
                                                  ? "cm"
                                                  : "kg",
                                          }
                                        : r,
                                    ),
                                  );
                                }}
                              >
                                {allowed.map((k) => (
                                  <option key={k} value={k}>
                                    {kindLabels[k]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                required
                                value={i[k]}
                                readOnly={
                                  (i.kind === "PESO" &&
                                    (k === "unit" ||
                                      (k === "initial" &&
                                        meta!.reported_weight_kg != null))) ||
                                  (i.kind === "SEMANAS_CUMPLIDAS" &&
                                    (k === "initial" || k === "unit"))
                                }
                                type={
                                  ["initial", "target", "reps"].includes(k)
                                    ? "number"
                                    : "text"
                                }
                                min={k === "reps" ? 1 : 0}
                                step={k === "reps" ? 1 : "any"}
                                onChange={(e) =>
                                  setInds(
                                    inds.map((r, n) =>
                                      n === index
                                        ? {
                                            ...r,
                                            [k]: e.target.value,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            )}
                          </Field>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
            {m.kind === "close" && (
              <>
                <div className="notice">
                  {closeBeforeStart
                    ? "La meta quedará en el historial como cancelada y podrás activar otra."
                    : "El historial quedará de solo lectura. La siguiente meta debe empezar después del cierre."}
                </div>
                {closeBeforeStart ? (
                  <p role="alert">
                    Esta meta estaba programada para empezar el{" "}
                    {nice(meta!.start_date)}.
                  </p>
                ) : (
                  <Field
                    label="Fin efectivo"
                    hint={`Elige una fecha entre el ${nice(meta!.start_date)} y el ${nice(closeMax)}.`}
                  >
                    <input
                      name="end_date"
                      type="date"
                      min={meta!.start_date}
                      max={closeMax}
                      defaultValue={closeMax}
                      required
                    />
                  </Field>
                )}
              </>
            )}
            {m.kind === "observe" && (
              <>
                <p className="form-intro">
                  Reemplaza la observación anterior. Se guardarán tu autoría y
                  la fecha de actualización.
                </p>
                <Field label="Observación vigente">
                  <textarea
                    name="observation"
                    rows={5}
                    maxLength={2000}
                    defaultValue={meta!.observation}
                    placeholder="Escribe tu observación sobre el seguimiento…"
                  />
                </Field>
              </>
            )}
            {m.kind === "record" && (
              <>
                <div className="category-tabs">
                  {[
                    ["exercise", "Ejercicio"],
                    ["food", "Alimentación"],
                    ["sleep", "Sueño"],
                    ["measurement", "Medición"],
                    ["substance", "Sustancias"],
                  ].map(([k, v]) => (
                    <button
                      type="button"
                      key={k}
                      disabled={Boolean(r?.id) && category !== k}
                      className={category === k ? "active" : ""}
                      onClick={() => setCategory(k)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {category !== "sleep" && (
                  <Field label="Fecha local del registro">
                    <input
                      type="date"
                      name="date"
                      defaultValue={String(r?.date ?? now)}
                      required
                    />
                  </Field>
                )}
                {category === "exercise" && (
                  <>
                    <Field label="Hora local del ejercicio">
                      <input
                        type="time"
                        name="time"
                        defaultValue={String(r?.time ?? "18:00").slice(0, 5)}
                        required
                      />
                    </Field>
                    <Field label="Ejercicio">
                      <input
                        name="name"
                        defaultValue={String(r?.name ?? "")}
                        placeholder="Ej. Press de banca"
                        maxLength={160}
                        required
                      />
                    </Field>
                    <div className="form-grid three">
                      <Field label="Series">
                        <input
                          type="number"
                          name="series"
                          min="1"
                          step="1"
                          defaultValue={Number(r?.series ?? 3)}
                          required
                        />
                      </Field>
                      <Field label="Repeticiones">
                        <input
                          type="number"
                          name="reps"
                          min="1"
                          step="1"
                          defaultValue={Number(r?.reps ?? 10)}
                          required
                        />
                      </Field>
                      <Field label="Carga (kg)">
                        <input
                          type="number"
                          name="weight"
                          min="0"
                          step="0.1"
                          defaultValue={Number(r?.weight ?? 0)}
                          required
                        />
                      </Field>
                    </div>
                    <Field label="Estado">
                      <select
                        name="performed"
                        defaultValue={String(r?.performed ?? true)}
                      >
                        <option value="true">Realizado</option>
                        <option value="false">No realizado</option>
                      </select>
                    </Field>
                  </>
                )}
                {category === "food" && (
                  <>
                    <Field label="Tipo de registro">
                      <select
                        value={foodKind}
                        onChange={(e) => setFoodKind(e.target.value)}
                      >
                        <option value="declaracion">
                          Declaración del plan diario
                        </option>
                        <option value="comida">Comida (informativa)</option>
                      </select>
                    </Field>
                    {foodKind === "declaracion" ? (
                      <Field
                        label="¿Cumpliste el plan diario completo?"
                        hint="Solo esta declaración determina el día válido."
                      >
                        <select
                          name="complete"
                          defaultValue={String(r?.complete ?? true)}
                        >
                          <option value="true">
                            Sí, cumplí el plan completo
                          </option>
                          <option value="false">
                            No, el plan no se completó
                          </option>
                        </select>
                      </Field>
                    ) : (
                      <Field label="Descripción de la comida">
                        <textarea
                          name="meal"
                          rows={3}
                          maxLength={500}
                          defaultValue={String(r?.meal ?? "")}
                          required
                        />
                      </Field>
                    )}
                  </>
                )}
                {category === "sleep" && (
                  <>
                    <div className="notice">
                      Se asigna al día de finalización en la zona{" "}
                      {user.timezone}. Ingresa horarios en la zona de este
                      dispositivo.
                    </div>
                    <Field label="Inicio del descanso">
                      <input
                        type="datetime-local"
                        name="start"
                        defaultValue={
                          local(r?.start) || addDays(now, -1) + "T23:00"
                        }
                        required
                      />
                    </Field>
                    <Field label="Fin del descanso">
                      <input
                        type="datetime-local"
                        name="end"
                        defaultValue={local(r?.end) || now + "T07:00"}
                        required
                      />
                    </Field>
                  </>
                )}
                {category === "measurement" && (
                  <>
                    <Field
                      label="Indicador de esta meta"
                      hint="Selecciona por su nombre. No necesitas ingresar claves de la base de datos."
                    >
                      <select
                        name="indicator_id"
                        defaultValue={String(r?.indicator_id ?? "")}
                        required
                      >
                        <option value="">Selecciona un indicador</option>
                        {state.indicadores
                          .filter(
                            (i) =>
                              i.meta_id === meta!.id &&
                              i.kind !== "SEMANAS_CUMPLIDAS",
                          )
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.unit})
                              {i.kind === "FUERZA"
                                ? " · " + i.reps + " reps · " + i.equipment
                                : ""}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Valor medido (unidad del indicador)">
                      <input
                        type="number"
                        name="value"
                        min="0"
                        step="any"
                        defaultValue={r?.value ?? ""}
                        required
                      />
                    </Field>
                    <p className="setup-note">
                      Para fuerza, mantén el ejercicio, técnica, equipo y
                      repeticiones del indicador.
                    </p>
                  </>
                )}
                {category === "substance" && (
                  <>
                    <div className="notice">
                      Opcional e informativo. No afecta el cumplimiento ni
                      constituye una recomendación de consumo.
                    </div>
                    <Field label="Nombre">
                      <input
                        name="name"
                        defaultValue={String(r?.name ?? "")}
                        maxLength={160}
                        required
                      />
                    </Field>
                    <Field label="Cantidad / descripción">
                      <input
                        name="amount"
                        defaultValue={String(r?.amount ?? "")}
                        maxLength={160}
                        required
                      />
                    </Field>
                  </>
                )}
              </>
            )}
            {error && (
              <div className="form-error" role="alert">
                <ShieldCheck size={18} />
                {error}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={onClose}
            >
              {m.kind === "help" ? "Entendido" : "Cancelar"}
            </button>
            {m.kind !== "help" && (
              <button
                type="submit"
                className={
                  "btn " + (m.kind === "delete" ? "danger" : "primary")
                }
                disabled={busy}
              >
                {busy
                  ? "Guardando…"
                  : closeBeforeStart
                    ? "Confirmar cancelación"
                    : m.kind === "activate"
                      ? "Validar y activar"
                      : m.kind === "delete"
                        ? "Eliminar registro"
                        : m.kind === "reset"
                          ? "Reiniciar"
                          : m.kind === "propose"
                            ? "Enviar propuesta"
                            : "Guardar cambios"}
                {!busy && <Check size={16} />}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
