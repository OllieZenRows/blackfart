import { bucket, categories, database, jsonError, safeName, sameOrigin, signedIn } from "../shared";

export const dynamic = "force-dynamic";
const MAX_AUDIO = 16 * 1024 * 1024;
const MAX_VIDEO = 24 * 1024 * 1024;
const allowedMedia = new Set([
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm",
  "video/mp4", "video/webm", "video/quicktime",
]);

export async function GET() {
  try {
    const rows = await database().prepare(`
      SELECT e.id, e.category, e.title, e.story, e.media_type AS mediaType,
        e.media_source AS mediaSource, e.duration_ms AS durationMs,
        e.latitude, e.longitude, e.verification_status AS verificationStatus,
        e.created_at AS createdAt, COUNT(v.entry_id) AS votes
      FROM entries e LEFT JOIN entry_votes v ON v.entry_id = e.id
      WHERE e.status = 'approved'
      GROUP BY e.id
      ORDER BY votes DESC, e.created_at DESC LIMIT 60
    `).all();
    return Response.json({ entries: rows.results ?? [] }, { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=60" } });
  } catch (error) {
    console.error("Could not load approved entries", error);
    return jsonError("The Fartifyty chart is taking a breather. Try again shortly.", 503);
  }
}

export async function POST(request: Request) {
  const user = await signedIn();
  if (!user) return jsonError("Sign in with ChatGPT before submitting.", 401);
  if (!sameOrigin(request)) return jsonError("Please submit from the Blackfart site.", 403);
  try {
    const form = await request.formData();
    const category = String(form.get("category") || "other");
    const title = (String(form.get("title") ?? "").trim() || "Quick log").slice(0, 90);
    const story = String(form.get("story") ?? "").trim().slice(0, 3000);
    const source = form.get("mediaSource") === "capture" ? "recorded-in-app" : "previous-upload";
    const durationValue = Number(form.get("durationMs"));
    const durationMs = Number.isFinite(durationValue) && durationValue > 0 && durationValue <= 30000 ? durationValue : null;
    const consent = form.get("consent") === "yes";
    if (!consent) return jsonError("Confirm that this is your own story or recording and that it is okay to publish after review.");
    if (!categories.has(category)) return jsonError("Choose a story category.");
    if (!title) return jsonError("Give the story a short title.");
    const uploaded = form.get("media");
    const file = uploaded instanceof File && uploaded.size ? uploaded : null;
    if (file && !allowedMedia.has(file.type)) return jsonError("Upload an MP3, WAV, M4A, OGG, WebM, MP4, or MOV recording.");
    if (file && file.size > (file.type.startsWith("video/") ? MAX_VIDEO : MAX_AUDIO)) {
      return jsonError(file.type.startsWith("video/") ? "Video files must be 24 MB or smaller." : "Audio files must be 16 MB or smaller.");
    }
    const areaLabel = null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (form.get("shareLocation") === "yes") {
      const rawLat = form.get("latitude");
      const rawLng = form.get("longitude");
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (typeof rawLat !== "string" || !rawLat.trim() || typeof rawLng !== "string" || !rawLng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return jsonError("Turn on rough location sharing or leave the map location off.");
      }
      // Store a coarse grid cell only: about 55 km between points at the equator.
      latitude = Math.round(lat * 2) / 2;
      longitude = Math.round(lng * 2) / 2;
    }
    if (form.get("entryMode") === "map" && (latitude === null || !story)) return jsonError("Choose a pin and add a short story.");
    if (!story && !file) return jsonError("Add a story, a recording, or both.");
    const db = database();
    const id = crypto.randomUUID();
    const key = file ? `${id}/${safeName(file.name)}` : null;
    if (file && key) {
      await bucket().put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { entryId: id, mediaSource: source },
      });
    }
    const displayName = (user.fullName || user.displayName || "Blackfart member").replace(/[\r\n<>]/g, " ").slice(0, 80);
    try {
      await db.batch([
        db.prepare(`INSERT INTO members (user_id, email, display_name) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name`)
          .bind(user.userId, user.email, displayName),
        db.prepare(`INSERT INTO entries (id, user_id, category, title, story, media_key, media_name,
          media_type, media_source, duration_ms, area_label, latitude, longitude, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
          .bind(id, user.userId, category, title, story, key, file ? safeName(file.name) : null,
            file ? file.type : null, file ? source : "text", durationMs, areaLabel, latitude, longitude),
      ]);
    } catch (error) {
      if (key) await bucket().delete(key).catch(() => undefined);
      throw error;
    }
    return Response.json({ id, status: "pending", message: "Sent to the review desk. It will appear on the chart and map after approval." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not save a member entry", error);
    return jsonError("We could not save that yet. Your draft is still here; please try again.", 503);
  }
}
