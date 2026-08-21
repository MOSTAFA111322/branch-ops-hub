CREATE TABLE `scheduledReportDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskUid` varchar(120) NOT NULL,
	`marker` varchar(80) NOT NULL,
	`recipientId` int NOT NULL,
	`status` enum('delivered','failed') NOT NULL DEFAULT 'delivered',
	`notificationId` int,
	`error` text,
	`deliveredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scheduledReportDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduledReportDeliveries_task_marker_recipient_unique` UNIQUE(`taskUid`,`marker`,`recipientId`)
);
