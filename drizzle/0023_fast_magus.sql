ALTER TABLE `favoritePeriodRanges` ADD `isPinned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `favoritePeriodRanges` ADD `shortcutKey` varchar(24);