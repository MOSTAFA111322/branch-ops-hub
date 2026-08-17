import { relations } from "drizzle-orm";
import { branches, regions, users } from "./schema";

export const regionsRelations = relations(regions, ({ one, many }) => ({
  manager: one(users, { fields: [regions.managerId], references: [users.id] }),
  branches: many(branches),
  users: many(users),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  region: one(regions, { fields: [branches.regionId], references: [regions.id] }),
  manager: one(users, { fields: [branches.managerId], references: [users.id] }),
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  region: one(regions, { fields: [users.regionId], references: [regions.id] }),
  branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
  managedRegions: many(regions),
  managedBranches: many(branches),
}));
