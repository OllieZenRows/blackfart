CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`story` text DEFAULT '' NOT NULL,
	`media_key` text,
	`media_name` text,
	`media_type` text,
	`media_source` text DEFAULT 'text' NOT NULL,
	`duration_ms` real,
	`area_label` text,
	`latitude` real,
	`longitude` real,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entries_public_chart_idx` ON `entries` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `entries_member_idx` ON `entries` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `entry_votes` (
	`entry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_votes_once_idx` ON `entry_votes` (`entry_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `entry_votes_entry_idx` ON `entry_votes` (`entry_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
