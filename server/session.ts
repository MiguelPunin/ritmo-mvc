import { cookies } from "next/headers";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import type { State } from "../domain/types";
import { DomainError } from "../domain/commands";
export interface DemoSession {
  userId: string;
  state: State;
  exp: number;
}
const key = () => {
  const secret = process.env.DEMO_SECRET;
  if (!secret && process.env.NODE_ENV === "production")
    throw new DomainError("Falta configurar DEMO_SECRET en el servidor.", 503);
  return createHash("sha256")
    .update(secret ?? "local-development-only-ritmo")
    .digest();
};
export async function writeDemo(data: DemoSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    cipher.update(deflateSync(JSON.stringify(data))),
    cipher.final(),
  ]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), body]).toString(
    "base64url",
  );
  if (value.length > 24500)
    throw new DomainError(
      "La demostración alcanzó su capacidad. Reiníciala o conecta Supabase para guardar más registros.",
    );
  const jar = await cookies();
  const n = Math.ceil(value.length / 3500);
  for (let i = 0; i < 7; i++) {
    if (i < n)
      jar.set(
        "ritmo_demo_" + i,
        value.slice(i * 3500, (i + 1) * 3500),
        options(),
      );
    else jar.delete("ritmo_demo_" + i);
  }
}
export async function readDemo(): Promise<DemoSession | null> {
  const jar = await cookies();
  let value = "";
  for (let i = 0; i < 7; i++) value += jar.get("ritmo_demo_" + i)?.value ?? "";
  if (!value) return null;
  try {
    const b = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    decipher.setAuthTag(b.subarray(12, 28));
    const decoded = JSON.parse(
      inflateSync(
        Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]),
        { maxOutputLength: 150000 },
      ).toString(),
    ) as DemoSession;
    return decoded.exp > Date.now() ? decoded : null;
  } catch {
    return null;
  }
}
export const options = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 28800,
});
export async function clearSession() {
  const jar = await cookies();
  for (let i = 0; i < 7; i++) jar.delete("ritmo_demo_" + i);
  jar.delete("ritmo_access");
  jar.delete("ritmo_refresh");
}
