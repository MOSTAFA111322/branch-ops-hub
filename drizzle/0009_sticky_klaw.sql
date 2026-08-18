CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int,
	`branchId` int,
	`entityType` varchar(80) NOT NULL,
	`entityId` int,
	`action` varchar(80) NOT NULL,
	`beforeData` text,
	`afterData` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
