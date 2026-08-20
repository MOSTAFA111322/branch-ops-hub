CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipientId` int NOT NULL,
	`kind` varchar(80) NOT NULL,
	`title` varchar(220) NOT NULL,
	`content` text NOT NULL,
	`entityType` varchar(80),
	`entityId` int,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reportApprovals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodYear` int NOT NULL,
	`periodMonth` int NOT NULL,
	`approverId` int NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`signatureText` varchar(220),
	`notes` text,
	`signedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reportApprovals_id` PRIMARY KEY(`id`),
	CONSTRAINT `report_approval_period_approver_unique` UNIQUE(`periodYear`,`periodMonth`,`approverId`)
);
