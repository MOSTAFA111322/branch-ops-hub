ALTER TABLE `users` ADD `username` varchar(80);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `failedLoginAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lockedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `lastLocalSignIn` timestamp;