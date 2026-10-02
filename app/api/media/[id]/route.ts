import { env } from "cloudflare:workers";
import { bucket, database, jsonError, signedIn } from "../../shared";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await signedIn();
    const adminEmail = (env as unknown as { BF_ADMIN_EMAIL?: string }).BF_ADMIN_EMAIL;
    const isModerator = Boolean(user && adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase());
    const row = await database().prepare(`SELECT media_key AS mediaKey, media_type AS mediaType FROM entries
      WHERE id = ? AND (status = 'approved' OR (status = 'pending' AND ? = 1))`)
      .bind(id, isModerator ? 1 : 0).first<{ mediaKey: string | null; mediaType: string | null }>();
    if (!row?.mediaKey || !row.mediaType) return jsonError("This recording is not public.", 404);
    const object = await bucket().get(row.mediaKey);
    if (!object) return jsonError("This recording could not be found.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": row.mediaType,
        "Content-Length": String(object.size),
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; media-src 'self'; sandbox",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Could not read approved media", error);
    return jsonError("Recording playback is unavailable.", 503);
  }
}
