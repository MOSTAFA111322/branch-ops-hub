CREATE TABLE `branchAssets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`assetType` varchar(100) NOT NULL,
	`serialNumber` varchar(120),
	`status` enum('active','maintenance','retired') NOT NULL DEFAULT 'active',
	`warrantyUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branchAssets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branchContracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`counterparty` varchar(180),
	`contractType` varchar(100) NOT NULL,
	`startsAt` timestamp,
	`expiresAt` timestamp,
	`status` enum('active','expiring','expired','terminated') NOT NULL DEFAULT 'active',
	`fileUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branchContracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branchEmployees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`jobTitle` varchar(120) NOT NULL,
	`employmentStatus` enum('active','on_leave','inactive') NOT NULL DEFAULT 'active',
	`phone` varchar(32),
	`joinedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branchEmployees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branchEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `branchEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branchInventory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`itemName` varchar(180) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`quantity` decimal(12,2) NOT NULL DEFAULT '0',
	`minimumQuantity` decimal(12,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branchInventory_id` PRIMARY KEY(`id`)
);
