import { database, jsonError, sameOrigin, signedIn } from "../shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await signedIn();
  if (!user) return jsonError("Sign in before voting.", 401);
  if (!sameOrigin(request)) return jsonError("Please vote from the Blackfart site.", 403);
  try {
    const { entryId } = await request.json() as { entryId?: string };
    if (!entryId || entryId.length > 60) return jsonError("Choose a chart entry.");
    const db = database();
    const exists = await db.prepare("SELECT id FROM entries WHERE id = ? AND status = 'approved'").bind(entryId).first();
    if (!exists) return jsonError("That chart entry is no longer available.", 404);
    const result = await db.prepare("INSERT OR IGNORE INTO entry_votes (entry_id, user_id) VALUES (?, ?)")
      .bind(entryId, user.userId).run();
    const row = await db.prepare("SELECT COUNT(*) AS votes FROM entry_votes WHERE entry_id = ?").bind(entryId).first<{ votes: number }>();
    return Response.json({ voted: (result.meta?.changes ?? 0) > 0, votes: Number(row?.votes ?? 0) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not save chart vote", error);
    return jsonError("Voting is unavailable right now. Try again shortly.", 503);
  }
}
