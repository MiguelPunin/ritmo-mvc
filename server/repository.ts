import { cookies } from "next/headers";
import type { Context, State, Table } from "../domain/types";
import { emptyState } from "../domain/types";
import {
  DomainError,
  applyChange,
  scope,
  type Change,
} from "../domain/commands";
import { readDemo, writeDemo, options } from "./session";
const projectKey = () =>
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
export const configured = () =>
  Boolean(process.env.SUPABASE_URL && projectKey());
export type AuthUser = { id: string };
export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
};
export async function supabase<T = unknown>(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  if (!configured())
    throw new DomainError(
      "Supabase aún no está configurado. Puedes usar la demostración.",
      503,
    );
  const r = await fetch(process.env.SUPABASE_URL!.replace(/\/$/, "") + path, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: projectKey()!,
      ...(token ? { Authorization: "Bearer " + token } : {}),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const e = data as {
      message?: string;
      msg?: string;
      error_description?: string;
      code?: string;
      error_code?: string;
    } | null;
    const message =
      e?.message ??
      e?.msg ??
      e?.error_description ??
      "No se pudo completar la operación.";
    // Supabase Auth can report a rejected access token as HTTP 403.
    const rejectedToken =
      Boolean(token) &&
      (e?.error_code === "bad_jwt" ||
        e?.code === "PGRST301" ||
        (r.status === 403 && /^invalid JWT\b/i.test(message)));
    throw new DomainError(
      message,
      r.status === 401 || rejectedToken ? 401 : 422,
    );
  }
  return data as T;
}
async function accessToken() {
  const jar = await cookies();
  let token = jar.get("ritmo_access")?.value;
  const refresh = jar.get("ritmo_refresh")?.value;
  if (!token && !refresh)
    throw new DomainError("Inicia sesión para continuar.", 401);
  try {
    if (token) {
      const user = await supabase<AuthUser>("/auth/v1/user", token);
      return { token, user };
    }
  } catch (e) {
    if (!(e instanceof DomainError) || e.status !== 401) throw e;
  }
  if (!refresh)
    throw new DomainError(
      "La sesión ha caducado. Inicia sesión nuevamente.",
      401,
    );
  const data = await supabase<AuthTokens>(
    "/auth/v1/token?grant_type=refresh_token",
    undefined,
    { method: "POST", body: JSON.stringify({ refresh_token: refresh }) },
  ).catch(() => {
    throw new DomainError(
      "La sesión ha caducado. Inicia sesión nuevamente.",
      401,
    );
  });
  jar.set("ritmo_access", data.access_token, options());
  jar.set("ritmo_refresh", data.refresh_token, options());
  token = data.access_token;
  return { token: token!, user: data.user };
}
export async function loadContext(): Promise<Context> {
  const demo = await readDemo();
  if (demo) {
    const user = demo.state.usuarios.find((u) => u.id === demo.userId);
    if (!user) throw new DomainError("Sesión inválida.", 401);
    return { user, state: scope(demo.state, user), demo: true };
  }
  const { token, user: auth } = await accessToken();
  const state = emptyState();
  await Promise.all(
    (Object.keys(state) as Table[]).map(async (table) => {
      state[table] = (await supabase(
        "/rest/v1/" + table + "?select=*&limit=10000",
        token,
      )) as never;
    }),
  );
  const user = state.usuarios.find((u) => u.id === auth.id);
  if (!user)
    throw new DomainError(
      "Tu cuenta no tiene un perfil configurado. Contacta al administrador.",
      403,
    );
  return { user, state: scope(state, user), demo: false };
}
export async function persist(change: Change, context: Context) {
  if (context.demo) {
    const session = await readDemo();
    if (!session) throw new DomainError("La demostración ha caducado.", 401);
    session.state = applyChange(session.state, change);
    await writeDemo(session);
    return;
  }
  const { token } = await accessToken();
  if (change.activation) {
    await supabase("/rest/v1/rpc/activar_meta", token, {
      method: "POST",
      body: JSON.stringify({
        p_meta: change.activation.meta,
        p_indicadores: change.activation.indicators,
      }),
    });
    return;
  }
  if (change.deleteId) {
    await supabase(`/rest/v1/${change.table}?id=eq.${change.deleteId}`, token, {
      method: "DELETE",
    });
    return;
  }
  if (change.row) {
    const existing = context.state[change.table].some(
      (r) => r.id === change.row!.id,
    );
    await supabase(
      `/rest/v1/${change.table}${existing ? "?id=eq." + change.row.id : ""}`,
      token,
      {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify(change.row),
        headers: { Prefer: "return=minimal" },
      },
    );
  }
}
