import { and, desc, eq, inArray, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { branches, branchAssets, branchContracts, branchEmployees, branchEvents, branchInventory, branchFinancialSnapshots, correctiveActions, documents, internalRequests, maintenanceTickets, qualityCases, tasks, users, visits, InsertUser, User } from "../drizzle/schema";
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

export async function getOperationsOverview(user: Pick<User, "id" | "role" | "regionId" | "branchId">, period: "day" | "week" | "month" = "month", regionId?: number) {
  const db = await getDb();
  if (!db) return { visits: [], actions: [], documents: [], qualityCases: [], maintenanceTickets: [], requests: [], tasks: [], qualityAnalysis: [], operationalSummary: null };
  const visible = (await listBranches(user)).filter((branch) => !regionId || branch.regionId === regionId);
  const ids = visible.map((branch) => branch.id);
  if (user.role !== "admin" && !ids.length) return { visits: [], actions: [], documents: [], qualityCases: [], maintenanceTickets: [], requests: [], tasks: [], qualityAnalysis: [], operationalSummary: null };
  const periodMs = period === "day" ? 86400000 : period === "week" ? 604800000 : 2592000000;
  const since = new Date(Date.now() - periodMs);
  const previousSince = new Date(since.getTime() - periodMs);
  const filterRows = async <T extends { branchId: number | null; createdAt?: Date | null }>(table: any, from: Date, to?: Date) => {
    const dateFilter = to ? and(gte(table.createdAt, from), lt(table.createdAt, to)) : gte(table.createdAt, from);
    const rows = await db.select().from(table).where(dateFilter).limit(100) as T[];
    return user.role === "admin" ? rows : rows.filter((row) => row.branchId == null || ids.includes(row.branchId));
  };
  const [visitsRows, actionRows, documentRows, qualityRows, maintenanceRows, requestRows, taskRows, previousQualityRows, previousMaintenanceRows, previousTaskRows, financialRows] = await Promise.all([
    filterRows(visits, since), filterRows(correctiveActions, since), filterRows(documents, since), filterRows(qualityCases, since), filterRows(maintenanceTickets, since), filterRows(internalRequests, since), filterRows(tasks, since),
    filterRows(qualityCases, previousSince, since), filterRows(maintenanceTickets, previousSince, since), filterRows(tasks, previousSince, since),
    db.select().from(branchFinancialSnapshots).orderBy(desc(branchFinancialSnapshots.periodYear), desc(branchFinancialSnapshots.periodMonth)).limit(240),
  ]);
  const scopedTasks = user.role === "admin" ? taskRows : taskRows.filter((row: any) => row.assigneeId === user.id);
  const scopedPreviousTasks = user.role === "admin" ? previousTaskRows : previousTaskRows.filter((row: any) => row.assigneeId === user.id);
  const scopedRequests = user.role === "admin" ? requestRows : requestRows.filter((row: any) => row.requesterId === user.id);
  const activityRows = [...visitsRows, ...actionRows, ...qualityRows, ...maintenanceRows, ...scopedRequests, ...scopedTasks] as Array<{ branchId?: number | null }>;
  const qualityCounts = new Map<string, { cause: string; count: number; open: number }>();
  for (const row of qualityRows as Array<{ rootCause?: string | null; category?: string | null; status?: string | null }>) {
    const cause = row.rootCause?.trim() || row.category?.trim() || "سبب غير محدد";
    const current = qualityCounts.get(cause) ?? { cause, count: 0, open: 0 };
    current.count += 1;
    if (row.status !== "closed" && row.status !== "resolved") current.open += 1;
    qualityCounts.set(cause, current);
  }
  const qualityAnalysis = Array.from(qualityCounts.values()).sort((a, b) => b.count - a.count || b.open - a.open);
  const summarizeOperations = (qualityInput: any[], maintenanceInput: any[], taskInput: any[]) => ({
    quality: {
      total: qualityInput.length,
      open: qualityInput.filter((row: any) => !["closed", "resolved"].includes(row.status)).length,
      critical: qualityInput.filter((row: any) => row.severity === "critical").length,
      high: qualityInput.filter((row: any) => row.severity === "high").length,
    },
    maintenance: {
      total: maintenanceInput.length,
      open: maintenanceInput.filter((row: any) => !["closed", "resolved"].includes(row.status)).length,
      urgent: maintenanceInput.filter((row: any) => row.priority === "urgent").length,
      breakdowns: maintenanceInput.filter((row: any) => row.ticketType === "breakdown").length,
      preventive: maintenanceInput.filter((row: any) => row.ticketType === "preventive").length,
    },
    compliance: {
      total: taskInput.length,
      completed: taskInput.filter((row: any) => row.status === "done").length,
      rate: taskInput.length ? Math.round((taskInput.filter((row: any) => row.status === "done").length / taskInput.length) * 100) : null,
    },
  });
  const operationalSummary = { ...summarizeOperations(qualityRows, maintenanceRows, scopedTasks), period };
  const previousOperationalSummary = { ...summarizeOperations(previousQualityRows, previousMaintenanceRows, scopedPreviousTasks), period };
  const operationalComparison = {
    current: operationalSummary,
    previous: previousOperationalSummary,
    delta: {
      qualityTotal: operationalSummary.quality.total - previousOperationalSummary.quality.total,
      qualityOpen: operationalSummary.quality.open - previousOperationalSummary.quality.open,
      maintenanceTotal: operationalSummary.maintenance.total - previousOperationalSummary.maintenance.total,
      maintenanceOpen: operationalSummary.maintenance.open - previousOperationalSummary.maintenance.open,
      complianceRate: operationalSummary.compliance.rate === null || previousOperationalSummary.compliance.rate === null ? null : operationalSummary.compliance.rate - previousOperationalSummary.compliance.rate,
    },
  };
  const comparison = visible.map((branch, index) => ({ id: branch.id, name: branch.name, city: branch.city, healthScore: branch.healthScore, openActions: branch.openActions, riskLevel: Number(branch.healthScore) < 75 ? "مرتفع" : Number(branch.healthScore) < 85 ? "متوسط" : "مستقر", activityCount: activityRows.filter((row) => row.branchId === branch.id).length, period, rank: index + 1 }));
  const visibleFinancialRows = (user.role === "admin" ? financialRows : financialRows.filter((row) => ids.includes(row.branchId))) as Array<{ branchId: number; periodYear: number; periodMonth: number; revenue: string | number; netProfit: string | number }>;
  const trendMap = new Map<string, { period: string; year: number; month: number; revenue: number; netProfit: number; branches: number }>();
  for (const row of visibleFinancialRows) {
    const key = `${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`;
    const current = trendMap.get(key) ?? { period: key, year: row.periodYear, month: row.periodMonth, revenue: 0, netProfit: 0, branches: 0 };
    current.revenue += Number(row.revenue ?? 0);
    current.netProfit += Number(row.netProfit ?? 0);
    current.branches += 1;
    trendMap.set(key, current);
  }
  const financialTrend = Array.from(trendMap.values()).sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
  return { comparison, financialTrend, visits: visitsRows, actions: actionRows, documents: documentRows, qualityCases: qualityRows, qualityAnalysis, operationalSummary, previousOperationalSummary, operationalComparison, maintenanceTickets: maintenanceRows, requests: scopedRequests, tasks: scopedTasks, tasksAndRequests: [...scopedTasks, ...scopedRequests] };
}

export async function getDashboardSummary(user: Pick<User, "id" | "role" | "regionId" | "branchId">) {
  const db = await getDb();
  if (!db) return { branches: [], activeBranchesCount: 0, inactiveBranchesCount: 0, representativesCount: 0, warehousesCount: 0, openActions: 0, upcomingVisits: 0, expiringDocuments: 0, openMaintenance: 0, tasks: [], alerts: [] };
  const allBranches = await db.select().from(branches).orderBy(desc(branches.healthScore));
  const visibleBranches = user.role === "admin" ? allBranches : allBranches.filter((branch) => user.branchId ? branch.id === user.branchId : user.regionId ? branch.regionId === user.regionId : false);
  const branchIds = visibleBranches.map((branch) => branch.id);
  if (!branchIds.length && user.role !== "admin") return { branches: [], activeBranchesCount: 0, inactiveBranchesCount: 0, representativesCount: 0, warehousesCount: 0, openActions: 0, upcomingVisits: 0, expiringDocuments: 0, openMaintenance: 0, tasks: [], alerts: [] };
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
    ...taskRows.filter((row) => row.status !== "done" && row.dueAt && new Date(row.dueAt).getTime() < Date.now()).slice(0, 5).map((row) => ({ id: `task-overdue-${row.id}`, kind: "task" as const, branchId: row.branchId ?? 0, title: row.title, detail: `${row.branchId ? branchName.get(row.branchId) ?? "فرع غير محدد" : "مهمة عامة"} · مهمة متأخرة وتحتاج تصعيدًا`, tone: "rose" as const })),
  ];
  const activeBranchesCount = visibleBranches.filter((branch) => branch.operationalType === "branch" && branch.status === "active").length;
  const inactiveBranchesCount = visibleBranches.filter((branch) => branch.operationalType === "branch" && branch.status !== "active").length;
  const representativesCount = visibleBranches.filter((branch) => branch.operationalType === "representative").length;
  const warehousesCount = visibleBranches.filter((branch) => branch.operationalType === "warehouse").length;
  return {
    branches: branchRows,
    activeBranchesCount,
    inactiveBranchesCount,
    representativesCount,
    warehousesCount,
    openActions: actionRows.length,
    upcomingVisits: visitRows.length,
    expiringDocuments: documentRows.length,
    openMaintenance: maintenanceRows.length,
    tasks: taskRows,
    alerts,
  };
}
