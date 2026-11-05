import { loadContext, persist } from "../../../server/repository";
import { prepare } from "../../../domain/commands";
import { sameOrigin, failure, body } from "../../../server/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const context = await loadContext();
    const change = prepare(await body(request), context.user, context.state);
    await persist(change, context);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
