ALTER TABLE `visits` ADD `reportTitle` varchar(220);--> statement-breakpoint
ALTER TABLE `visits` ADD `findings` text;--> statement-breakpoint
ALTER TABLE `visits` ADD `recommendations` text;--> statement-breakpoint
ALTER TABLE `visits` ADD `approvalStatus` enum('draft','submitted','approved') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `visits` ADD `approvedAt` timestamp;