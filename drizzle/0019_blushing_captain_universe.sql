CREATE TABLE `reportShareLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`sharedById` int NOT NULL,
	`recipients` text NOT NULL,
	`status` enum('queued','sent','failed','partial') NOT NULL DEFAULT 'queued',
	`channel` varchar(40) NOT NULL DEFAULT 'email',
	`error` text,
	`sharedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reportShareLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userBranchPermissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`branchId` int NOT NULL,
	`canView` boolean NOT NULL DEFAULT true,
	`canExport` boolean NOT NULL DEFAULT false,
	`canShare` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userBranchPermissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_branch_permission_unique` UNIQUE(`userId`,`branchId`)
);
--> statement-breakpoint
ALTER TABLE `branches` ADD `latitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `branches` ADD `longitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `branches` ADD `coordinateSource` varchar(120);--> statement-breakpoint
ALTER TABLE `branches` ADD `coordinatesVerifiedAt` timestamp;