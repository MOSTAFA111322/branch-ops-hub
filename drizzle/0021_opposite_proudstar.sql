CREATE TABLE `favoritePeriodRanges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`fromDate` varchar(10) NOT NULL,
	`toDate` varchar(10) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `favoritePeriodRanges_id` PRIMARY KEY(`id`),
	CONSTRAINT `favorite_period_user_name_unique` UNIQUE(`userId`,`name`)
);
