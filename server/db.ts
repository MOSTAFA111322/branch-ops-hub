import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { branches, branchAssets, branchContracts, branchEmployees, branchEvents, branchInventory, correctiveActions, documents, internalRequests, maintenanceTickets, qualityCases, tasks, users, visits, InsertUser, User } from "../drizzle/schema";
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

async function getBranchRecordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return result[0];
}

export async function getBranchById(id: number, user: Pick<User, "role" | "regionId" | "branchId">) {
  return getBranchProfile(id, user);
}

export async function getBranchProfile(id: number, user: Pick<User, "role" | "regionId" | "branchId">) {
  const db = await getDb();
  if (!db) return undefined;
  const branch = await getBranchRecordById(id);
  if (!branch) return undefined;
  const allowed = user.role === "admin" || (user.branchId ? user.branchId === id : user.regionId ? user.regionId === branch.regionId : false);
  if (!allowed) return undefined;
  const [employees, contracts, assets, inventory, documentsRows, actions, qualityRows, maintenanceRows, events, visitsRows, requests, tasksRows] = await Promise.all([
    db.select().from(branchEmployees).where(eq(branchEmployees.branchId, id)).orderBy(desc(branchEmployees.createdAt)),
    db.select().from(branchContracts).where(eq(branchContracts.branchId, id)).orderBy(desc(branchContracts.createdAt)),
    db.select().from(branchAssets).where(eq(branchAssets.branchId, id)).orderBy(desc(branchAssets.createdAt)),
    db.select().from(branchInventory).where(eq(branchInventory.branchId, id)).orderBy(desc(branchInventory.updatedAt)),
    db.select().from(documents).where(eq(documents.branchId, id)).orderBy(desc(documents.createdAt)),
    db.select().from(correctiveActions).where(eq(correctiveActions.branchId, id)).orderBy(desc(correctiveActions.createdAt)),
    db.select().from(qualityCases).where(eq(qualityCases.branchId, id)).orderBy(desc(qualityCases.createdAt)),
    db.select().from(maintenanceTickets).where(eq(maintenanceTickets.branchId, id)).orderBy(desc(maintenanceTickets.createdAt)),
    db.select().from(branchEvents).where(eq(branchEvents.branchId, id)).orderBy(desc(branchEvents.occurredAt)),
    db.select().from(visits).where(eq(visits.branchId, id)).orderBy(desc(visits.createdAt)),
    db.select().from(internalRequests).where(eq(internalRequests.branchId, id)).orderBy(desc(internalRequests.createdAt)),
    db.select().from(tasks).where(eq(tasks.branchId, id)).orderBy(desc(tasks.createdAt)),
  ]);
  return { branch, employees, contracts, assets, inventory, documents: documentsRows, actions, qualityCases: qualityRows, maintenanceTickets: maintenanceRows, events, visits: visitsRows, requests, tasks: tasksRows };
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
  if (!db) return { branches: [], openActions: 0, upcomingVisits: 0, expiringDocuments: 0, openMaintenance: 0, tasks: [], alerts: [] };
  const allBranches = await db.select().from(branches).orderBy(desc(branches.healthScore));
  const visibleBranches = user.role === "admin" ? allBranches : allBranches.filter((branch) => user.branchId ? branch.id === user.branchId : user.regionId ? branch.regionId === user.regionId : false);
  const branchIds = visibleBranches.map((branch) => branch.id);
  if (!branchIds.length && user.role !== "admin") return { branches: [], openActions: 0, upcomingVisits: 0, expiringDocuments: 0, openMaintenance: 0, tasks: [], alerts: [] };
  const scope = user.role === "admin" ? undefined : inArray(correctiveActions.branchId, branchIds);
  const [branchRows, actionRows, visitRows, documentRows, maintenanceRows, taskRows] = await Promise.all([
    Promise.resolve(visibleBranches),
    scope ? db.select().from(correctiveActions).where(scope) : db.select().from(correctiveActions).where(eq(correctiveActions.status, "open")),
    user.role === "admin" ? db.select().from(visits).where(eq(visits.status, "scheduled")) : db.select().from(visits).where(inArray(visits.branchId, branchIds)),
    user.role === "admin" ? db.select().from(documents).where(eq(documents.status, "expiring")) : db.select().from(documents).where(inArray(documents.branchId, branchIds)),
    user.role === "admin" ? db.select().from(maintenanceTickets).where(eq(maintenanceTickets.status, "open")) : db.select().from(maintenanceTickets).where(inArray(maintenanceTickets.branchId, branchIds)),
    db.select().from(tasks).where(eq(tasks.status, "todo")).orderBy(desc(tasks.createdAt)).limit(8),
  ]);
  const branchName = new Map(visibleBranches.map((branch) => [branch.id, branch.name]));
  const alerts = [
    ...documentRows.slice(0, 5).map((row) => ({ id: `document-${row.id}`, kind: "document" as const, branchId: row.branchId, title: row.title, detail: `${branchName.get(row.branchId) ?? "فرع غير محدد"} · وثيقة تحتاج انتباه`, tone: "rose" as const })),
    ...maintenanceRows.slice(0, 5).map((row) => ({ id: `maintenance-${row.id}`, kind: "maintenance" as const, branchId: row.branchId, title: row.title, detail: `${branchName.get(row.branchId) ?? "فرع غير محدد"} · بلاغ صيانة مفتوح`, tone: "amber" as const })),
    ...visitRows.slice(0, 5).map((row) => ({ id: `visit-${row.id}`, kind: "visit" as const, branchId: row.branchId, title: "زيارة ميدانية مجدولة", detail: `${branchName.get(row.branchId) ?? "فرع غير محدد"} · ${row.scheduledAt ? new Date(row.scheduledAt).toLocaleDateString("ar-SA") : "موعد غير محدد"}`, tone: "blue" as const })),
    ...actionRows.filter((row) => row.status === "open").slice(0, 5).map((row) => ({ id: `action-${row.id}`, kind: "action" as const, branchId: row.branchId, title: row.title, detail: `${branchName.get(row.branchId) ?? "فرع غير محدد"} · إجراء مفتوح`, tone: "orange" as const })),
  ];
  return {
    branches: branchRows,
    openActions: actionRows.length,
    upcomingVisits: visitRows.length,
    expiringDocuments: documentRows.length,
    openMaintenance: maintenanceRows.length,
    tasks: taskRows,
    alerts,
  };
}
