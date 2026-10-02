import { sql } from "drizzle-orm";
import { index, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  story: text("story").notNull().default(""),
  mediaKey: text("media_key"),
  mediaName: text("media_name"),
  mediaType: text("media_type"),
  mediaSource: text("media_source").notNull().default("text"),
  durationMs: real("duration_ms"),
  areaLabel: text("area_label"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  status: text("status").notNull().default("pending"),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("entries_public_chart_idx").on(table.status, table.createdAt),
  index("entries_member_idx").on(table.userId, table.createdAt),
]);

export const entryVotes = sqliteTable("entry_votes", {
  entryId: text("entry_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("entry_votes_once_idx").on(table.entryId, table.userId),
  index("entry_votes_entry_idx").on(table.entryId),
]);
