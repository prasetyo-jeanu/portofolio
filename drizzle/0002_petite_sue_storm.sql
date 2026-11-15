CREATE TABLE `freelance_project_translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`freelance_project_id` integer NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`contribution` text DEFAULT '' NOT NULL,
	`approach` text DEFAULT '' NOT NULL,
	`impact` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`freelance_project_id`) REFERENCES `freelance_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `freelance_translations_project_locale_uq` ON `freelance_project_translations` (`freelance_project_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `freelance_translations_locale_slug_uq` ON `freelance_project_translations` (`locale`,`slug`);--> statement-breakpoint
CREATE INDEX `freelance_translations_locale_status_pub_idx` ON `freelance_project_translations` (`locale`,`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `freelance_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text DEFAULT 'freelance' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`is_confidential` integer DEFAULT false NOT NULL,
	`demo_url` text,
	`repo_url` text,
	`cover_media_id` integer,
	`tech_stack_json` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `freelance_projects_featured_sort_idx` ON `freelance_projects` (`featured`,`sort_order`);--> statement-breakpoint
CREATE INDEX `freelance_projects_deleted_at_idx` ON `freelance_projects` (`deleted_at`);