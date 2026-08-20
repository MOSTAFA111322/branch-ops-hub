import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, uniqueIndex } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "area_manager", "branch_manager", "quality", "maintenance", "warehouse", "factory"]).default("user").notNull(),
  regionId: int("regionId"),
  branchId: int("branchId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const dashboardPreferences = mysqlTable("dashboardPreferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  visibleWidgets: text("visibleWidgets").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const scheduledReportRecipients = mysqlTable("scheduledReportRecipients", {
  id: int("id").autoincrement().primaryKey(),
  taskUid: varchar("taskUid", { length: 120 }).notNull(),
  recipientId: int("recipientId").notNull(),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ uniqueRecipient: uniqueIndex("scheduledReportRecipients_task_recipient_unique").on(table.taskUid, table.recipientId) }));

export const regions = mysqlTable("regions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  managerId: int("managerId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  regionId: int("regionId"),
  operationalType: mysqlEnum("operationalType", ["branch", "representative", "warehouse"]).default("branch").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  region: varchar("region", { length: 120 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  address: text("address"),
  managerName: varchar("managerName", { length: 160 }),
  phone: varchar("phone", { length: 32 }),
  status: mysqlEnum("status", ["active", "paused", "closed"]).default("active").notNull(),
  healthScore: decimal("healthScore", { precision: 5, scale: 2 }).default("0").notNull(),
  openActions: int("openActions").default(0).notNull(),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high"]).default("low").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const branchFinancialSnapshots = mysqlTable("branchFinancialSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  periodYear: int("periodYear").notNull(),
  periodMonth: int("periodMonth").notNull(),
  revenue: decimal("revenue", { precision: 14, scale: 2 }).default("0").notNull(),
  costOfGoods: decimal("costOfGoods", { precision: 14, scale: 2 }).default("0").notNull(),
  operatingExpenses: decimal("operatingExpenses", { precision: 14, scale: 2 }).default("0").notNull(),
  netProfit: decimal("netProfit", { precision: 14, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  source: mysqlEnum("source", ["manual", "excel_import"]).default("manual").notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  branchPeriodUnique: uniqueIndex("branch_financial_branch_period_unique").on(table.branchId, table.periodYear, table.periodMonth),
}));

export const branchEmployees = mysqlTable("branchEmployees", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  jobTitle: varchar("jobTitle", { length: 120 }).notNull(),
  employmentStatus: mysqlEnum("employmentStatus", ["active", "on_leave", "inactive"]).default("active").notNull(),
  phone: varchar("phone", { length: 32 }),
  joinedAt: timestamp("joinedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const branchContracts = mysqlTable("branchContracts", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  counterparty: varchar("counterparty", { length: 180 }),
  contractType: varchar("contractType", { length: 100 }).notNull(),
  startsAt: timestamp("startsAt"),
  expiresAt: timestamp("expiresAt"),
  status: mysqlEnum("status", ["active", "expiring", "expired", "terminated"]).default("active").notNull(),
  fileUrl: text("fileUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const branchAssets = mysqlTable("branchAssets", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  assetType: varchar("assetType", { length: 100 }).notNull(),
  serialNumber: varchar("serialNumber", { length: 120 }),
  status: mysqlEnum("status", ["active", "maintenance", "retired"]).default("active").notNull(),
  warrantyUntil: timestamp("warrantyUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const branchInventory = mysqlTable("branchInventory", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  itemName: varchar("itemName", { length: 180 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).default("0").notNull(),
  minimumQuantity: decimal("minimumQuantity", { precision: 12, scale: 2 }).default("0").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const branchEvents = mysqlTable("branchEvents", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
});

export const visits = mysqlTable("visits", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  inspectorId: int("inspectorId"),
  scheduledAt: timestamp("scheduledAt"),
  completedAt: timestamp("completedAt"),
  status: mysqlEnum("status", ["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled").notNull(),
  score: decimal("score", { precision: 5, scale: 2 }),
  notes: text("notes"),
  reportTitle: varchar("reportTitle", { length: 220 }),
  findings: text("findings"),
  recommendations: text("recommendations"),
  approvalStatus: mysqlEnum("approvalStatus", ["draft", "submitted", "approved"]).default("draft").notNull(),
  checklistTemplateId: int("checklistTemplateId"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const checklistTemplates = mysqlTable("checklistTemplates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  category: varchar("category", { length: 100 }).default("تشغيلي").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const checklistItems = mysqlTable("checklistItems", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull(),
  label: varchar("label", { length: 240 }).notNull(),
  orderIndex: int("orderIndex").default(0).notNull(),
  isRequired: boolean("isRequired").default(true).notNull(),
});

export const visitChecklistResults = mysqlTable("visitChecklistResults", {
  id: int("id").autoincrement().primaryKey(),
  visitId: int("visitId").notNull(),
  itemId: int("itemId").notNull(),
  result: mysqlEnum("result", ["pass", "fail", "na"]).default("na").notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const correctiveActions = mysqlTable("correctiveActions", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  ownerId: int("ownerId"),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "pending_review", "closed"]).default("open").notNull(),
  dueAt: timestamp("dueAt"),
  closureEvidenceUrl: text("closureEvidenceUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  documentType: varchar("documentType", { length: 100 }).notNull(),
  version: varchar("version", { length: 32 }).default("1.0").notNull(),
  expiresAt: timestamp("expiresAt"),
  fileUrl: text("fileUrl"),
  status: mysqlEnum("status", ["valid", "expiring", "expired", "missing"]).default("valid").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const documentVersions = mysqlTable("documentVersions", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  documentType: varchar("documentType", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["valid", "expiring", "expired", "missing"]).notNull(),
  expiresAt: timestamp("expiresAt"),
  fileUrl: text("fileUrl"),
  recordedBy: int("recordedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const qualityCases = mysqlTable("qualityCases", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  caseType: mysqlEnum("caseType", ["non_conformity", "complaint", "observation"]).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "investigating", "resolved", "closed"]).default("open").notNull(),
  rootCause: text("rootCause"),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const maintenanceTickets = mysqlTable("maintenanceTickets", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull(),
  assetName: varchar("assetName", { length: 160 }).notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  ticketType: mysqlEnum("ticketType", ["breakdown", "preventive", "warranty"]).default("breakdown").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "assigned", "in_progress", "resolved", "closed"]).default("open").notNull(),
  warrantyUntil: timestamp("warrantyUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const internalRequests = mysqlTable("internalRequests", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId"),
  requesterId: int("requesterId"),
  title: varchar("title", { length: 220 }).notNull(),
  requestType: varchar("requestType", { length: 80 }).notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["new", "assigned", "in_progress", "completed", "rejected"]).default("new").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorId: int("actorId"),
  branchId: int("branchId"),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: int("entityId"),
  action: varchar("action", { length: 80 }).notNull(),
  beforeData: text("beforeData"),
  afterData: text("afterData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId"),
  assigneeId: int("assigneeId"),
  title: varchar("title", { length: 220 }).notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["todo", "in_progress", "done"]).default("todo").notNull(),
  dueAt: timestamp("dueAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Region = typeof regions.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type BranchFinancialSnapshot = typeof branchFinancialSnapshots.$inferSelect;
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  recipientId: int("recipientId").notNull(),
  kind: varchar("kind", { length: 80 }).notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  content: text("content").notNull(),
  entityType: varchar("entityType", { length: 80 }),
  entityId: int("entityId"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reportApprovals = mysqlTable("reportApprovals", {
  id: int("id").autoincrement().primaryKey(),
  periodYear: int("periodYear").notNull(),
  periodMonth: int("periodMonth").notNull(),
  approverId: int("approverId").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  signatureText: varchar("signatureText", { length: 220 }),
  notes: text("notes"),
  signedAt: timestamp("signedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  periodApproverUnique: uniqueIndex("report_approval_period_approver_unique").on(table.periodYear, table.periodMonth, table.approverId),
}));

export type CorrectiveAction = typeof correctiveActions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ReportApproval = typeof reportApprovals.$inferSelect;
