import { env } from "cloudflare:workers";
import { bucket, database, jsonError, sameOrigin, signedIn } from "../shared";

export const dynamic = "force-dynamic";

async function moderator() {
  const user = await signedIn();
  const adminEmail = (env as unknown as { BF_ADMIN_EMAIL?: string }).BF_ADMIN_EMAIL;
  return user && adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase() ? user : null;
}

export async function GET() {
  if (!(await moderator())) return jsonError("Moderator access required.", 403);
  try {
    const rows = await database().prepare(`SELECT e.id, e.category, e.title, e.story, e.media_type AS mediaType,
      e.media_source AS mediaSource, e.area_label AS areaLabel, e.created_at AS createdAt,
      m.email, m.display_name AS displayName FROM entries e LEFT JOIN members m ON m.user_id = e.user_id
      WHERE e.status = 'pending' ORDER BY e.created_at ASC LIMIT 100`).all();
    return Response.json({ entries: rows.results ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load moderation queue", error);
    return jsonError("The review desk is unavailable.", 503);
  }
}

export async function PATCH(request: Request) {
  if (!(await moderator())) return jsonError("Moderator access required.", 403);
  if (!sameOrigin(request)) return jsonError("Please review from the Blackfart site.", 403);
  try {
    const { entryId, decision } = await request.json() as { entryId?: string; decision?: string };
    if (!entryId || !["approved", "rejected"].includes(decision ?? "")) return jsonError("Choose an entry and an approval decision.");
    const db = database();
    const row = await db.prepare("SELECT media_key AS mediaKey FROM entries WHERE id = ? AND status = 'pending'").bind(entryId).first<{ mediaKey: string | null }>();
    if (!row) return jsonError("That entry has already been reviewed.", 404);
    await db.prepare("UPDATE entries SET status = ? WHERE id = ? AND status = 'pending'").bind(decision, entryId).run();
    if (decision === "rejected" && row.mediaKey) await bucket().delete(row.mediaKey).catch((error) => console.error("Could not remove rejected media", error));
    return Response.json({ status: decision }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not apply moderation decision", error);
    return jsonError("That review decision could not be saved.", 503);
  }
}
