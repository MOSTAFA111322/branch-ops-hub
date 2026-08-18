CREATE TABLE `documentVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`version` varchar(32) NOT NULL,
	`documentType` varchar(100) NOT NULL,
	`status` enum('valid','expiring','expired','missing') NOT NULL,
	`expiresAt` timestamp,
	`fileUrl` text,
	`recordedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documentVersions_id` PRIMARY KEY(`id`)
);
