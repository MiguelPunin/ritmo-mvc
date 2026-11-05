import { cookies } from "next/headers";
import { z } from "zod";
import {
  loadContext,
  configured,
  supabase,
  type AuthTokens,
} from "../../../server/repository";
import {
  clearSession,
  readDemo,
  writeDemo,
  options,
} from "../../../server/session";
import { sameOrigin, failure, body } from "../../../server/http";
import { seed } from "../../../domain/demo";
import { DomainError } from "../../../domain/commands";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(
      { ...(await loadContext()), configured: configured() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof DomainError && e.status === 401) {
      await clearSession();
      return Response.json(
        { user: null, configured: configured() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = await body(request);
    if (!input || typeof input !== "object")
      throw new DomainError("Solicitud no válida.", 400);
    if (input.action === "demo") {
      const session = input.reset ? null : await readDemo();
      const state = session?.state ?? seed();
      const role = z
        .enum(["cliente", "entrenador"])
        .safeParse(input.role ?? "cliente");
      if (!role.success)
        throw new DomainError("Perfil de demostración inválido.", 400);
      const user = state.usuarios.find((u) => u.role === role.data)!;
      await clearSession();
      await writeDemo({ state, userId: user.id, exp: Date.now() + 28800000 });
    } else if (input.action === "login") {
      const parsed = z
        .object({
          email: z.string().email().max(254),
          password: z.string().min(1).max(200),
        })
        .safeParse(input);
      if (!parsed.success)
        throw new DomainError("Ingresa un correo y una contraseña válidos.");
      let data;
      try {
        data = await supabase<AuthTokens>(
          "/auth/v1/token?grant_type=password",
          undefined,
          { method: "POST", body: JSON.stringify(parsed.data) },
        );
      } catch {
        throw new DomainError(
          "No se pudo iniciar sesión. Revisa tus credenciales y la configuración de Supabase.",
          401,
        );
      }
      await clearSession();
      const jar = await cookies();
      jar.set("ritmo_access", data.access_token, options());
      jar.set("ritmo_refresh", data.refresh_token, options());
    } else if (input.action === "logout") {
      await clearSession();
      return Response.json({ ok: true });
    } else throw new DomainError("Acción no válida.", 400);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
