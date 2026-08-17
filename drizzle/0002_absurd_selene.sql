CREATE TABLE `regions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`managerId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `regions_id` PRIMARY KEY(`id`),
	CONSTRAINT `regions_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `branches` ADD `regionId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `regionId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `branchId` int;