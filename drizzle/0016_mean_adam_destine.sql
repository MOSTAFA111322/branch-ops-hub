ALTER TABLE `branchFinancialSnapshots` ADD `salesReturns` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `branchFinancialSnapshots` ADD `netSales` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `branchFinancialSnapshots` ADD `costReturns` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `branchFinancialSnapshots` ADD `netCost` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `branchFinancialSnapshots` ADD `netProfitMargin` decimal(14,2) DEFAULT '0' NOT NULL;