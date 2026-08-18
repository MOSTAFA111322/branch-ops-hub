CREATE TABLE `checklistItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`label` varchar(240) NOT NULL,
	`orderIndex` int NOT NULL DEFAULT 0,
	`isRequired` boolean NOT NULL DEFAULT true,
	CONSTRAINT `checklistItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checklistTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`category` varchar(100) NOT NULL DEFAULT 'تشغيلي',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checklistTemplates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visitChecklistResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`visitId` int NOT NULL,
	`itemId` int NOT NULL,
	`result` enum('pass','fail','na') NOT NULL DEFAULT 'na',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `visitChecklistResults_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `visits` ADD `checklistTemplateId` int;