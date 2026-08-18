CREATE TABLE `branchFinancialSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`periodYear` int NOT NULL,
	`periodMonth` int NOT NULL,
	`revenue` decimal(14,2) NOT NULL DEFAULT '0',
	`costOfGoods` decimal(14,2) NOT NULL DEFAULT '0',
	`operatingExpenses` decimal(14,2) NOT NULL DEFAULT '0',
	`netProfit` decimal(14,2) NOT NULL DEFAULT '0',
	`notes` text,
	`source` enum('manual','excel_import') NOT NULL DEFAULT 'manual',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branchFinancialSnapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `branch_financial_branch_period_unique` UNIQUE(`branchId`,`periodYear`,`periodMonth`)
);
