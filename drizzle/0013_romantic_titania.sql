CREATE TABLE `dashboardPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`visibleWidgets` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dashboardPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `dashboardPreferences_userId_unique` UNIQUE(`userId`)
);
