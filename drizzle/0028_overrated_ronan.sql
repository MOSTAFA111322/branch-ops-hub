ALTER TABLE `branchFinancialSnapshots` ADD `approvalStatus` enum('draft','submitted','approved') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `branchFinancialSnapshots` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `branchFinancialSnapshots` ADD `approvedAt` timestamp;