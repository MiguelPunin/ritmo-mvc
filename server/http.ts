import { DomainError } from "../domain/commands";
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new DomainError("Solicitud de origen no autorizado.", 403);
}
export function failure(e: unknown) {
  if (e instanceof DomainError)
    return Response.json(
      { error: e.message },
      { status: e.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error("Request failed:", e instanceof Error ? e.message : "unknown");
  return Response.json(
    { error: "No se pudo completar la operación. Inténtalo nuevamente." },
    { status: 500 },
  );
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 32000)
    throw new DomainError("Solicitud demasiado grande.", 413);
  const text = await request.text();
  if (text.length > 32000)
    throw new DomainError("Solicitud demasiado grande.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError("El cuerpo debe ser JSON válido.", 400);
  }
}
