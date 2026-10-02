import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";

export const categories = new Set(["after-fight", "oopsie", "friends-house", "eleven-second", "other"]);

export function database(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("The member database is not available yet.");
  return binding;
}

export function bucket(): R2Bucket {
  const binding = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!binding) throw new Error("Media storage is not available yet.");
  return binding;
}

export async function signedIn() {
  return getChatGPTUser();
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-90) || "recording";
}
