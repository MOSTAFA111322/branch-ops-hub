import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { branches, correctiveActions, documents, internalRequests, maintenanceTickets, qualityCases, tasks, users, visits, InsertUser, User } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listBranches(user?: Pick<User, "role" | "regionId" | "branchId">) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(branches).orderBy(desc(branches.healthScore));
  if (!user || user.role === "admin") return rows;
  return rows.filter((branch) => user.branchId ? branch.id === user.branchId : user.regionId ? branch.regionId === user.regionId : false);
}

export async function getBranchById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return result[0];
}

export async function getOperationsOverview(user: Pick<User, "role" | "regionId" | "branchId">) {
  const db = await getDb();
  if (!db) return { visits: [], actions: [], documents: [], qualityCases: [], maintenanceTickets: [], requests: [], tasks: [] };
  const visible = await listBranches(user);
  const ids = visible.map((branch) => branch.id);
  if (user.role !== "admin" && !ids.length) return { visits: [], actions: [], documents: [], qualityCases: [], maintenanceTickets: [], requests: [], tasks: [] };
  const filterRows = async <T extends { branchId: number | null }>(table: any) => {
    const rows = await db.select().from(table).limit(50) as T[];
    return user.role === "admin" ? rows : rows.filter((row) => row.branchId == null || ids.includes(row.branchId));
  };
  const comparison = visible.map((branch, index) => ({ id: branch.id, name: branch.name, city: branch.city, healthScore: branch.healthScore, openActions: branch.openActions, riskLevel: Number(branch.healthScore) < 75 ? "مرتفع" : Number(branch.healthScore) < 85 ? "متوسط" : "مستقر", rank: index + 1 }));
  const [visitsRows, actionRows, documentRows, qualityRows, maintenanceRows, requestRows, taskRows] = await Promise.all([
    filterRows(visits), filterRows(correctiveActions), filterRows(documents), filterRows(qualityCases), filterRows(maintenanceTickets), filterRows(internalRequests), filterRows(tasks),
  ]);
  return { comparison, visits: visitsRows, actions: actionRows, documents: documentRows, qualityCases: qualityRows, maintenanceTickets: maintenanceRows, requests: requestRows, tasks: taskRows };
}

export async function getDashboardSummary(user: Pick<User, "id" | "role" | "regionId" | "branchId">) {
  const db = await getDb();
  if (!db) return { branches: [], openActions: 0, upcomingVisits: 0, expiringDocuments: 0, openMaintenance: 0, tasks: [] };
  const allBranches = await db.select().from(branches).orderBy(desc(branches.healthScore));
  const visibleBranches = user.role === "admin" ? allBranches : allBranches.filter((branch) => user.branchId ? branch.id === user.branchId : user.regionId ? branch.regionId === user.regionId : false);
  const branchIds = visibleBranches.map((branch) => branch.id);
  if (!branchIds.length && user.role !== "admin") return { branches: [], openActions: 0, upcomingVisits: 0, expiringDocuments: 0, openMaintenance: 0, tasks: [] };
  const scope = user.role === "admin" ? undefined : inArray(correctiveActions.branchId, branchIds);
  const [branchRows, actionRows, visitRows, documentRows, maintenanceRows, taskRows] = await Promise.all([
    Promise.resolve(visibleBranches),
    scope ? db.select({ id: correctiveActions.id }).from(correctiveActions).where(scope) : db.select({ id: correctiveActions.id }).from(correctiveActions).where(eq(correctiveActions.status, "open")),
    user.role === "admin" ? db.select({ id: visits.id }).from(visits).where(eq(visits.status, "scheduled")) : db.select({ id: visits.id }).from(visits).where(inArray(visits.branchId, branchIds)),
    user.role === "admin" ? db.select({ id: documents.id }).from(documents).where(eq(documents.status, "expiring")) : db.select({ id: documents.id }).from(documents).where(inArray(documents.branchId, branchIds)),
    user.role === "admin" ? db.select({ id: maintenanceTickets.id }).from(maintenanceTickets).where(eq(maintenanceTickets.status, "open")) : db.select({ id: maintenanceTickets.id }).from(maintenanceTickets).where(inArray(maintenanceTickets.branchId, branchIds)),
    db.select().from(tasks).where(eq(tasks.status, "todo")).orderBy(desc(tasks.createdAt)).limit(8),
  ]);
  return {
    branches: branchRows,
    openActions: actionRows.length,
    upcomingVisits: visitRows.length,
    expiringDocuments: documentRows.length,
    openMaintenance: maintenanceRows.length,
    tasks: taskRows,
  };
}
