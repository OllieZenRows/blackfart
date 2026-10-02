import { database, jsonError, signedIn } from "../shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await signedIn();
  if (!user) return jsonError("Sign in to see your submissions.", 401);
  try {
    const rows = await database().prepare(`SELECT id, category, title, status, media_type AS mediaType,
      media_source AS mediaSource, created_at AS createdAt FROM entries WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 40`).bind(user.userId).all();
    return Response.json({ entries: rows.results ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load member entries", error);
    return jsonError("Your logbook is unavailable right now.", 503);
  }
}
