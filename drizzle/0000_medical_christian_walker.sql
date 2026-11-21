CREATE TABLE `freelance_project_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`freelance_project_id` int NOT NULL,
	`locale` enum('id','en') NOT NULL,
	`title` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`summary` text NOT NULL,
	`contribution` text NOT NULL,
	`approach` text NOT NULL,
	`impact` text NOT NULL,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`published_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `freelance_project_translations_id` PRIMARY KEY(`id`),
	CONSTRAINT `freelance_translations_project_locale_uq` UNIQUE(`freelance_project_id`,`locale`),
	CONSTRAINT `freelance_translations_locale_slug_uq` UNIQUE(`locale`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `freelance_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(64) NOT NULL DEFAULT 'freelance',
	`featured` boolean NOT NULL DEFAULT false,
	`is_confidential` boolean NOT NULL DEFAULT false,
	`demo_url` varchar(512),
	`repo_url` varchar(512),
	`cover_media_id` int,
	`tech_stack_json` text NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `freelance_projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`storage_path` varchar(255) NOT NULL,
	`public_url` varchar(512) NOT NULL,
	`mime_type` varchar(128) NOT NULL,
	`size_bytes` int NOT NULL,
	`width` int,
	`height` int,
	`alt_id` varchar(512) NOT NULL DEFAULT '',
	`alt_en` varchar(512) NOT NULL DEFAULT '',
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `media_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_storage_path_unique` UNIQUE(`storage_path`)
);
--> statement-breakpoint
CREATE TABLE `post_tags` (
	`post_id` int NOT NULL,
	`tag_id` int NOT NULL,
	CONSTRAINT `post_tags_post_id_tag_id_pk` PRIMARY KEY(`post_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `post_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`post_id` int NOT NULL,
	`locale` enum('id','en') NOT NULL,
	`title` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`summary` text NOT NULL,
	`content_mdx` mediumtext NOT NULL,
	`seo_title` varchar(255),
	`seo_description` text,
	`og_image_url` varchar(512),
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`reading_time_minutes` int NOT NULL DEFAULT 1,
	`published_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `post_translations_id` PRIMARY KEY(`id`),
	CONSTRAINT `post_translations_post_locale_uq` UNIQUE(`post_id`,`locale`),
	CONSTRAINT `post_translations_locale_slug_uq` UNIQUE(`locale`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(64) NOT NULL DEFAULT 'engineering',
	`featured` boolean NOT NULL DEFAULT false,
	`cover_media_id` int,
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_tags` (
	`project_id` int NOT NULL,
	`tag_id` int NOT NULL,
	CONSTRAINT `project_tags_project_id_tag_id_pk` PRIMARY KEY(`project_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `project_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int NOT NULL,
	`locale` enum('id','en') NOT NULL,
	`title` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`role` varchar(255) NOT NULL DEFAULT '',
	`summary` text NOT NULL,
	`content_mdx` mediumtext NOT NULL,
	`seo_title` varchar(255),
	`seo_description` text,
	`og_image_url` varchar(512),
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`published_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `project_translations_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_translations_project_locale_uq` UNIQUE(`project_id`,`locale`),
	CONSTRAINT `project_translations_locale_slug_uq` UNIQUE(`locale`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(64) NOT NULL DEFAULT 'fullstack',
	`featured` boolean NOT NULL DEFAULT false,
	`is_confidential` boolean NOT NULL DEFAULT false,
	`demo_url` varchar(512),
	`repo_url` varchar(512),
	`cover_media_id` int,
	`gallery_json` text NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publishing_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` enum('running','success','failed','rolled_back') NOT NULL,
	`trigger_source` varchar(64) NOT NULL DEFAULT 'admin',
	`triggered_by_user_id` int,
	`summary` text,
	`logs` mediumtext NOT NULL,
	`error_message` text,
	`started_at` datetime(3) NOT NULL,
	`finished_at` datetime(3),
	CONSTRAINT `publishing_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(255) NOT NULL,
	`user_id` int NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` text,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` varchar(191) NOT NULL,
	`value` mediumtext NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `site_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`kind` enum('topic','tech') NOT NULL DEFAULT 'topic',
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `url_redirects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locale` enum('id','en') NOT NULL,
	`content_type` enum('post','project') NOT NULL,
	`from_path` varchar(255) NOT NULL,
	`to_path` varchar(255) NOT NULL,
	`status_code` int NOT NULL DEFAULT 301,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `url_redirects_id` PRIMARY KEY(`id`),
	CONSTRAINT `url_redirects_from_path_unique` UNIQUE(`from_path`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `freelance_project_translations` ADD CONSTRAINT `fk_freelance_trans_project_id` FOREIGN KEY (`freelance_project_id`) REFERENCES `freelance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `freelance_projects` ADD CONSTRAINT `freelance_projects_cover_media_id_media_id_fk` FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_tags` ADD CONSTRAINT `post_tags_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_tags` ADD CONSTRAINT `post_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_translations` ADD CONSTRAINT `post_translations_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `posts` ADD CONSTRAINT `posts_cover_media_id_media_id_fk` FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_tags` ADD CONSTRAINT `project_tags_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_tags` ADD CONSTRAINT `project_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_translations` ADD CONSTRAINT `project_translations_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_cover_media_id_media_id_fk` FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publishing_jobs` ADD CONSTRAINT `publishing_jobs_triggered_by_user_id_users_id_fk` FOREIGN KEY (`triggered_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `freelance_translations_locale_status_pub_idx` ON `freelance_project_translations` (`locale`,`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `freelance_projects_featured_sort_idx` ON `freelance_projects` (`featured`,`sort_order`);--> statement-breakpoint
CREATE INDEX `freelance_projects_deleted_at_idx` ON `freelance_projects` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `media_created_at_idx` ON `media` (`created_at`);--> statement-breakpoint
CREATE INDEX `post_translations_locale_status_pub_idx` ON `post_translations` (`locale`,`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `posts_deleted_at_idx` ON `posts` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `project_translations_locale_status_pub_idx` ON `project_translations` (`locale`,`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `projects_featured_sort_idx` ON `projects` (`featured`,`sort_order`);--> statement-breakpoint
CREATE INDEX `projects_deleted_at_idx` ON `projects` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `publishing_jobs_status_started_idx` ON `publishing_jobs` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `tags_kind_idx` ON `tags` (`kind`);--> statement-breakpoint
CREATE INDEX `url_redirects_locale_idx` ON `url_redirects` (`locale`);