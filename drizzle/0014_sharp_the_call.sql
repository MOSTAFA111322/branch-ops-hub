CREATE TABLE `scheduledReportRecipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskUid` varchar(120) NOT NULL,
	`recipientId` int NOT NULL,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scheduledReportRecipients_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduledReportRecipients_task_recipient_unique` UNIQUE(`taskUid`,`recipientId`)
);
