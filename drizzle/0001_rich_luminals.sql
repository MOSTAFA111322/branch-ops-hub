CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(160) NOT NULL,
	`region` varchar(120) NOT NULL,
	`city` varchar(120) NOT NULL,
	`address` text,
	`managerName` varchar(160),
	`phone` varchar(32),
	`status` enum('active','paused','closed') NOT NULL DEFAULT 'active',
	`healthScore` decimal(5,2) NOT NULL DEFAULT '0',
	`openActions` int NOT NULL DEFAULT 0,
	`riskLevel` enum('low','medium','high') NOT NULL DEFAULT 'low',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `correctiveActions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`ownerId` int,
	`title` varchar(220) NOT NULL,
	`description` text,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('open','in_progress','pending_review','closed') NOT NULL DEFAULT 'open',
	`dueAt` timestamp,
	`closureEvidenceUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `correctiveActions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`documentType` varchar(100) NOT NULL,
	`version` varchar(32) NOT NULL DEFAULT '1.0',
	`expiresAt` timestamp,
	`fileUrl` text,
	`status` enum('valid','expiring','expired','missing') NOT NULL DEFAULT 'valid',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `internalRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`requesterId` int,
	`title` varchar(220) NOT NULL,
	`requestType` varchar(80) NOT NULL,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('new','assigned','in_progress','completed','rejected') NOT NULL DEFAULT 'new',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `internalRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenanceTickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`assetName` varchar(160) NOT NULL,
	`title` varchar(220) NOT NULL,
	`ticketType` enum('breakdown','preventive','warranty') NOT NULL DEFAULT 'breakdown',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('open','assigned','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`warrantyUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenanceTickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qualityCases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`caseType` enum('non_conformity','complaint','observation') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','investigating','resolved','closed') NOT NULL DEFAULT 'open',
	`rootCause` text,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qualityCases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`assigneeId` int,
	`title` varchar(220) NOT NULL,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('todo','in_progress','done') NOT NULL DEFAULT 'todo',
	`dueAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`inspectorId` int,
	`scheduledAt` timestamp,
	`completedAt` timestamp,
	`status` enum('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`score` decimal(5,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','area_manager','branch_manager','quality','maintenance','warehouse','factory') NOT NULL DEFAULT 'user';