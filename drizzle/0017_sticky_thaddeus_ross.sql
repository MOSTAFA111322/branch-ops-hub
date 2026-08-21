CREATE TABLE `costCenterMappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceCode` varchar(80) NOT NULL,
	`sourceName` varchar(180) NOT NULL,
	`branchId` int,
	`centerType` enum('branch','warehouse','headquarters','representative') NOT NULL DEFAULT 'branch',
	`isSalesCenter` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `costCenterMappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `costCenterMappings_sourceCode_unique` UNIQUE(`sourceCode`)
);
