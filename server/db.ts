import { and, desc, eq, inArray, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { branches, branchAssets, branchContracts, branchEmployees, branchEvents, branchInventory, branchFinancialSnapshots, correctiveActions, documents, internalRequests, maintenanceTickets, qualityCases, tasks, users, visits, inventoryMovementSnapshots, userBranchPermissions, favoritePeriodRanges, InsertUser, User } from "../drizzle/schema";
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

export async function listBranches(user?: Pick<User, "id" | "role" | "regionId" | "branchId">) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(branches).orderBy(desc(branches.healthScore));
  if (!user || user.role === "admin") return rows;
  const permissionRows = await db.select({ branchId: userBranchPermissions.branchId, canView: userBranchPermissions.canView }).from(userBranchPermissions).where(eq(userBranchPermissions.userId, user.id));
  if (permissionRows.length) {
    const allowedIds = new Set(permissionRows.filter((permission) => permission.canView).map((permission) => permission.branchId));
    return rows.filter((branch) => allowedIds.has(branch.id));
  }
  return rows.filter((branch) => user.branchId ? branch.id === user.branchId : user.regionId ? branch.regionId === user.regionId : false);
}

async function getBranchRecordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return result[0];
}

export async function getBranchById(id: number, user: Pick<User, "id" | "role" | "regionId" | "branchId">) {
  return getBranchProfile(id, user);
}

export async function getBranchProfile(id: number, user: Pick<User, "id" | "role" | "regionId" | "branchId">) {
  const db = await getDb();
  if (!db) return undefined;
  const branch = await getBranchRecordById(id);
  if (!branch) return undefined;
  const visibleBranches = await listBranches(user);
  const allowed = visibleBranches.some((visibleBranch) => visibleBranch.id === id);
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

export async function getOperationsOverview(user: Pick<User, "id" | "role" | "regionId" | "branchId">, period: "day" | "week" | "month" = "month", regionId?: number, year = new Date().getFullYear(), month = new Date().getMonth() + 1) {
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
  const branchScope = user.role === "admin" || ids.length > 0;
  const [visitsRows, actionRows, documentRows, qualityRows, maintenanceRows, requestRows, taskRows, previousQualityRows, previousMaintenanceRows, previousTaskRows, financialRows, employeeRows, assetRows, contractRows, inventoryRows, allDocumentRows] = await Promise.all([
    filterRows(visits, since), filterRows(correctiveActions, since), filterRows(documents, since), filterRows(qualityCases, since), filterRows(maintenanceTickets, since), filterRows(internalRequests, since), filterRows(tasks, since),
    filterRows(qualityCases, previousSince, since), filterRows(maintenanceTickets, previousSince, since), filterRows(tasks, previousSince, since),
    db.select().from(branchFinancialSnapshots).orderBy(desc(branchFinancialSnapshots.periodYear), desc(branchFinancialSnapshots.periodMonth)).limit(240),
    branchScope ? db.select().from(branchEmployees).where(inArray(branchEmployees.branchId, ids)) : db.select().from(branchEmployees),
    branchScope ? db.select().from(branchAssets).where(inArray(branchAssets.branchId, ids)) : db.select().from(branchAssets),
    branchScope ? db.select().from(branchContracts).where(inArray(branchContracts.branchId, ids)) : db.select().from(branchContracts),
    branchScope ? db.select().from(branchInventory).where(inArray(branchInventory.branchId, ids)) : db.select().from(branchInventory),
    branchScope ? db.select().from(documents).where(inArray(documents.branchId, ids)) : db.select().from(documents),
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
  const dataQuality = visible.map((branch) => {
    const missingFields = [
      !branch.managerName ? "مدير الفرع" : null,
      !branch.phone ? "رقم التواصل" : null,
      !branch.address ? "العنوان" : null,
      !branch.regionId ? "المنطقة المرتبطة" : null,
      !(employeeRows as Array<{ branchId: number }>).some((row) => row.branchId === branch.id) ? "بيانات الموظفين" : null,
      !(assetRows as Array<{ branchId: number }>).some((row) => row.branchId === branch.id) ? "الأصول" : null,
      !(contractRows as Array<{ branchId: number }>).some((row) => row.branchId === branch.id) ? "العقود" : null,
      !(inventoryRows as Array<{ branchId: number }>).some((row) => row.branchId === branch.id) ? "المخزون" : null,
      !(allDocumentRows as Array<{ branchId: number }>).some((row) => row.branchId === branch.id) ? "الوثائق" : null,
    ].filter((value): value is string => Boolean(value));
    const completedVisits = (visitsRows as Array<{ branchId: number; status?: string }>).filter((row) => row.branchId === branch.id && row.status === "completed").length;
    const plannedVisits = (visitsRows as Array<{ branchId: number }>).filter((row) => row.branchId === branch.id).length;
    return { branchId: branch.id, branchName: branch.name, completenessRate: Math.round(((9 - missingFields.length) / 9) * 100), missingFields, plannedVisits, completedVisits, visitCommitmentRate: plannedVisits ? Math.round((completedVisits / plannedVisits) * 100) : null };
  });
  const qualitySummary = { averageCompletenessRate: dataQuality.length ? Math.round(dataQuality.reduce((sum, item) => sum + item.completenessRate, 0) / dataQuality.length) : null, branchesNeedingData: dataQuality.filter((item) => item.missingFields.length > 0).length, averageVisitCommitmentRate: (() => { const rows = dataQuality.filter((item) => item.visitCommitmentRate !== null); return rows.length ? Math.round(rows.reduce((sum, item) => sum + (item.visitCommitmentRate ?? 0), 0) / rows.length) : null; })() };
  const comparison = visible.map((branch, index) => ({ id: branch.id, name: branch.name, city: branch.city, healthScore: branch.healthScore, openActions: branch.openActions, riskLevel: Number(branch.healthScore) < 75 ? "مرتفع" : Number(branch.healthScore) < 85 ? "متوسط" : "مستقر", activityCount: activityRows.filter((row) => row.branchId === branch.id).length, period, rank: index + 1 }));
  const visibleFinancialRows = (user.role === "admin" ? financialRows : financialRows.filter((row) => ids.includes(row.branchId))) as Array<{ branchId: number; periodYear: number; periodMonth: number; revenue: string | number; netProfit: string | number; operatingExpenses?: string | number }>;
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
  const previousPeriod = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const currentPeriodLabel = `${year}-${String(month).padStart(2, "0")}`;
  const previousPeriodLabel = `${previousPeriod.year}-${String(previousPeriod.month).padStart(2, "0")}`;
  const branchFinancialMap = new Map<number, { id: number; name: string; city: string; operationalType: string; currentRevenue: number | null; previousRevenue: number | null; currentProfit: number | null; previousProfit: number | null; currentExpenses: number; }>();
  for (const branch of visible) branchFinancialMap.set(branch.id, { id: branch.id, name: branch.name, city: branch.city, operationalType: branch.operationalType ?? "branch", currentRevenue: null, previousRevenue: null, currentProfit: null, previousProfit: null, currentExpenses: 0 });
  for (const row of visibleFinancialRows) {
    const item = branchFinancialMap.get(row.branchId); if (!item) continue;
    if (row.periodYear === year && row.periodMonth === month) { item.currentRevenue = Number(row.revenue ?? 0); item.currentProfit = Number(row.netProfit ?? 0); item.currentExpenses = Number(row.operatingExpenses ?? 0); }
    if (row.periodYear === previousPeriod.year && row.periodMonth === previousPeriod.month) { item.previousRevenue = Number(row.revenue ?? 0); item.previousProfit = Number(row.netProfit ?? 0); }
  }
  const financialByBranch = Array.from(branchFinancialMap.values()).map((item) => ({ ...item, operatingExpenses: item.currentExpenses, currentPeriod: currentPeriodLabel, previousPeriod: previousPeriodLabel, revenueChangePercent: item.previousRevenue ? Math.round(((item.currentRevenue ?? 0) - item.previousRevenue) / item.previousRevenue * 1000) / 10 : null, profitChangePercent: item.previousProfit ? Math.round(((item.currentProfit ?? 0) - item.previousProfit) / item.previousProfit * 1000) / 10 : null }));
  return { comparison, financialTrend, financialByBranch, financialPeriod: { year, month, current: currentPeriodLabel, previous: previousPeriodLabel }, visits: visitsRows, actions: actionRows, documents: documentRows, qualityCases: qualityRows, qualityAnalysis, operationalSummary, previousOperationalSummary, operationalComparison, dataQuality, qualitySummary, maintenanceTickets: maintenanceRows, requests: scopedRequests, tasks: scopedTasks, tasksAndRequests: [...scopedTasks, ...scopedRequests] };
}

export async function getInventoryMovementAnalysis(user: Pick<User, "id" | "role" | "regionId" | "branchId">, filters: { itemQuery?: string; costCenterCode?: string; branchId?: number; from?: Date; to?: Date }) {
  const db = await getDb();
  if (!db) return { rows: [], monthlyReport: [], totals: { salesQuantity: 0, netSales: 0, netCost: 0, availableQuantity: 0 }, staleItems: [], topSellingItems: [] };
  const visibleBranches = await db.select({ id: branches.id, regionId: branches.regionId }).from(branches);
  const visibleIds = visibleBranches.filter((branch) => user.role === "admin" || (user.role === "area_manager" && branch.regionId === user.regionId) || ((user.role === "branch_manager" || user.role === "user") && branch.id === user.branchId)).map((branch) => branch.id);
  const conditions = [] as any[];
  if (filters.branchId) conditions.push(eq(inventoryMovementSnapshots.branchId, filters.branchId)); else if (visibleIds.length) conditions.push(inArray(inventoryMovementSnapshots.branchId, visibleIds));
  if (filters.costCenterCode) conditions.push(eq(inventoryMovementSnapshots.costCenterCode, filters.costCenterCode));
  if (filters.from) conditions.push(gte(inventoryMovementSnapshots.periodEnd, filters.from));
  if (filters.to) conditions.push(lt(inventoryMovementSnapshots.periodStart, new Date(filters.to.getTime() + 86400000)));
  const sourceRows = await db.select().from(inventoryMovementSnapshots).where(conditions.length ? and(...conditions) : undefined);
  const query = filters.itemQuery?.trim().toLocaleLowerCase("ar");
  const filtered = query ? sourceRows.filter((row) => row.itemCode.toLocaleLowerCase("ar").includes(query) || row.itemName.toLocaleLowerCase("ar").includes(query)) : sourceRows;
  const groups = new Map<string, any>();
  const monthlyGroups = new Map<string, any>();
  for (const row of filtered) {
    const key = `${row.itemCode}::${row.costCenterCode}`;
    const current = groups.get(key) ?? { itemCode: row.itemCode, itemName: row.itemName, costCenterCode: row.costCenterCode, salesQuantity: 0, netSales: 0, netCost: 0, availableQuantity: 0, availableCost: 0, stockAgeDays: 0, rowCount: 0 };
    current.salesQuantity += Number(row.salesQuantity ?? 0); current.netSales += Number(row.netSales ?? 0); current.netCost += Number(row.netCost ?? 0); current.availableQuantity += Number(row.availableQuantity ?? 0); current.availableCost += Number(row.availableCost ?? 0); current.stockAgeDays = Math.max(current.stockAgeDays, Number(row.stockAgeDays ?? 0)); current.rowCount += 1;
    groups.set(key, current);
    const month = new Date(row.periodStart).toISOString().slice(0, 7);
    const monthlyKey = `${month}::${row.itemCode}::${row.costCenterCode}`;
    const monthlyCurrent = monthlyGroups.get(monthlyKey) ?? { period: month, itemCode: row.itemCode, itemName: row.itemName, costCenterCode: row.costCenterCode, salesQuantity: 0, netSales: 0, netCost: 0, availableQuantity: 0, rowCount: 0 };
    monthlyCurrent.salesQuantity += Number(row.salesQuantity ?? 0); monthlyCurrent.netSales += Number(row.netSales ?? 0); monthlyCurrent.netCost += Number(row.netCost ?? 0); monthlyCurrent.availableQuantity += Number(row.availableQuantity ?? 0); monthlyCurrent.rowCount += 1;
    monthlyGroups.set(monthlyKey, monthlyCurrent);
  }
  const rows = Array.from(groups.values()).map((row) => ({ ...row, staleValue: row.availableCost, grossMargin: row.netSales - row.netCost, marginRate: row.netSales ? ((row.netSales - row.netCost) / row.netSales) * 100 : null })).sort((a, b) => b.netSales - a.netSales);
  const staleItems = rows.filter((row) => row.salesQuantity <= 0 && row.availableQuantity > 0).sort((a, b) => b.availableQuantity - a.availableQuantity).slice(0, 50);
  const topSellingItems = [...rows].filter((row) => row.salesQuantity > 0).sort((a, b) => b.grossMargin - a.grossMargin).slice(0, 50);
  const monthlyReport = Array.from(monthlyGroups.values()).map((row) => ({ ...row, grossMargin: row.netSales - row.netCost, marginRate: row.netSales ? ((row.netSales - row.netCost) / row.netSales) * 100 : null })).sort((a, b) => a.period.localeCompare(b.period) || b.netSales - a.netSales).slice(0, 1000);
  return { rows: rows.slice(0, 500), monthlyReport, totals: { salesQuantity: rows.reduce((sum, row) => sum + row.salesQuantity, 0), netSales: rows.reduce((sum, row) => sum + row.netSales, 0), netCost: rows.reduce((sum, row) => sum + row.netCost, 0), availableQuantity: rows.reduce((sum, row) => sum + row.availableQuantity, 0) }, staleItems, topSellingItems };
}

export async function getDashboardSummary(user: Pick<User, "id" | "role" | "regionId" | "branchId">, range?: { from?: Date; to?: Date }) {
  const db = await getDb();
  if (!db) return { branches: [], activeBranchesCount: 0, inactiveBranchesCount: 0, representativesCount: 0, warehousesCount: 0, openActions: 0, upcomingVisits: 0, expiringDocuments: 0, openMaintenance: 0, tasks: [], alerts: [], smartInventorySummary: null };
  const allBranches = await db.select().from(branches).orderBy(desc(branches.healthScore));
  const visibleBranches = user.role === "admin" ? allBranches : allBranches.filter((branch) => user.branchId ? branch.id === user.branchId : user.regionId ? branch.regionId === user.regionId : false);
  const branchIds = visibleBranches.map((branch) => branch.id);
  if (!branchIds.length && user.role !== "admin") return { branches: [], activeBranchesCount: 0, inactiveBranchesCount: 0, representativesCount: 0, warehousesCount: 0, openActions: 0, upcomingVisits: 0, expiringDocuments: 0, openMaintenance: 0, tasks: [], alerts: [], smartInventorySummary: null };
  const scope = user.role === "admin" ? undefined : inArray(correctiveActions.branchId, branchIds);
  const [branchRows, actionRows, visitRows, documentRows, maintenanceRows, taskRows, inventoryRows] = await Promise.all([
    Promise.resolve(visibleBranches),
    scope ? db.select().from(correctiveActions).where(scope) : db.select().from(correctiveActions).where(eq(correctiveActions.status, "open")),
    user.role === "admin" ? db.select().from(visits).where(eq(visits.status, "scheduled")) : db.select().from(visits).where(inArray(visits.branchId, branchIds)),
    user.role === "admin" ? db.select().from(documents).where(eq(documents.status, "expiring")) : db.select().from(documents).where(inArray(documents.branchId, branchIds)),
    user.role === "admin" ? db.select().from(maintenanceTickets).where(eq(maintenanceTickets.status, "open")) : db.select().from(maintenanceTickets).where(inArray(maintenanceTickets.branchId, branchIds)),
    db.select().from(tasks).where(eq(tasks.status, "todo")).orderBy(desc(tasks.createdAt)).limit(8),
    user.role === "admin" ? db.select().from(inventoryMovementSnapshots) : db.select().from(inventoryMovementSnapshots).where(inArray(inventoryMovementSnapshots.branchId, branchIds)),
  ]);
  const branchName = new Map(visibleBranches.map((branch) => [branch.id, branch.name]));
  const scopedInventoryRows = inventoryRows.filter((row) => (!range?.from || new Date(row.periodEnd).getTime() >= range.from.getTime()) && (!range?.to || new Date(row.periodStart).getTime() <= range.to.getTime()));
  const inventoryGrouped = new Map<string, { itemName: string; branchId: number | null; available: number; sales: number }>();
  for (const row of scopedInventoryRows) { const key = `${row.itemCode}::${row.costCenterCode}`; const current = inventoryGrouped.get(key) ?? { itemName: row.itemName, branchId: row.branchId, available: 0, sales: 0 }; current.available += Number(row.availableQuantity ?? 0); current.sales += Number(row.salesQuantity ?? 0); inventoryGrouped.set(key, current); }
  const inventoryAlerts: Array<{ id: string; kind: "inventory_stale" | "inventory_low"; branchId: number; title: string; detail: string; tone: "amber" | "rose" }> = Array.from(inventoryGrouped.values()).reduce((alerts, row, index) => {
    if (row.available > 0 && row.sales <= 0) alerts.push({ id: `inventory-stale-${index}`, kind: "inventory_stale", branchId: row.branchId ?? 0, title: `صنف راكد: ${row.itemName}`, detail: `${row.branchId ? branchName.get(row.branchId) ?? "فرع غير محدد" : "مركز غير محدد"} · متاح ${row.available.toLocaleString("ar-SA")} دون مبيعات`, tone: "amber" });
    else if (row.available >= 0 && row.available <= 5 && row.sales > 0) alerts.push({ id: `inventory-low-${index}`, kind: "inventory_low", branchId: row.branchId ?? 0, title: `مخزون منخفض: ${row.itemName}`, detail: `${row.branchId ? branchName.get(row.branchId) ?? "فرع غير محدد" : "مركز غير محدد"} · المتاح ${row.available.toLocaleString("ar-SA")}`, tone: "rose" });
    return alerts;
  }, [] as Array<{ id: string; kind: "inventory_stale" | "inventory_low"; branchId: number; title: string; detail: string; tone: "amber" | "rose" }>);
  const monthlyInventory = new Map<string, number>(); for (const row of scopedInventoryRows) { const period = new Date(row.periodStart).toISOString().slice(0, 7); monthlyInventory.set(period, (monthlyInventory.get(period) ?? 0) + Number(row.netSales ?? 0)); } const periods = Array.from(monthlyInventory.keys()).sort(); const currentPeriod = periods.at(-1) ?? null; const previousPeriod = periods.at(-2) ?? null; const currentSales = currentPeriod ? monthlyInventory.get(currentPeriod) ?? 0 : 0; const previousSales = previousPeriod ? monthlyInventory.get(previousPeriod) ?? 0 : 0; const salesChangePercent = previousSales ? ((currentSales - previousSales) / Math.abs(previousSales)) * 100 : null; const priorYearPeriod = currentPeriod ? `${Number(currentPeriod.slice(0, 4)) - 1}${currentPeriod.slice(4)}` : null; const priorYearSales = priorYearPeriod ? monthlyInventory.get(priorYearPeriod) ?? 0 : 0; const yearOverYearChangePercent = priorYearSales ? ((currentSales - priorYearSales) / Math.abs(priorYearSales)) * 100 : null; const staleItems = Array.from(inventoryGrouped.values()).filter((row) => row.available > 0 && row.sales <= 0).slice(0, 5).map((row) => ({ itemName: row.itemName, branchId: row.branchId, available: row.available })); const lowStockItems = Array.from(inventoryGrouped.values()).filter((row) => row.available >= 0 && row.available <= 5 && row.sales > 0).slice(0, 5).map((row) => ({ itemName: row.itemName, branchId: row.branchId, available: row.available }));
  const alerts = [
    ...documentRows.slice(0, 5).map((row) => ({ id: `document-${row.id}`, kind: "document" as const, branchId: row.branchId, title: row.title, detail: `${branchName.get(row.branchId) ?? "فرع غير محدد"} · وثيقة تحتاج انتباه`, tone: "rose" as const })),
    ...maintenanceRows.slice(0, 5).map((row) => ({ id: `maintenance-${row.id}`, kind: "maintenance" as const, branchId: row.branchId, title: row.title, detail: `${branchName.get(row.branchId) ?? "فرع غير محدد"} · بلاغ صيانة مفتوح`, tone: "amber" as const })),
    ...visitRows.slice(0, 5).map((row) => ({ id: `visit-${row.id}`, kind: "visit" as const, branchId: row.branchId, title: "زيارة ميدانية مجدولة", detail: `${branchName.get(row.branchId) ?? "فرع غير محدد"} · ${row.scheduledAt ? new Date(row.scheduledAt).toLocaleDateString("ar-SA") : "موعد غير محدد"}`, tone: "blue" as const })),
    ...actionRows.filter((row) => row.status === "open").slice(0, 5).map((row) => ({ id: `action-${row.id}`, kind: "action" as const, branchId: row.branchId, title: row.title, detail: `${branchName.get(row.branchId) ?? "فرع غير محدد"} · إجراء مفتوح`, tone: "orange" as const })),
    ...taskRows.filter((row) => row.status !== "done" && row.dueAt && new Date(row.dueAt).getTime() < Date.now()).slice(0, 5).map((row) => ({ id: `task-overdue-${row.id}`, kind: "task" as const, branchId: row.branchId ?? 0, title: row.title, detail: `${row.branchId ? branchName.get(row.branchId) ?? "فرع غير محدد" : "مهمة عامة"} · مهمة متأخرة وتحتاج تصعيدًا`, tone: "rose" as const })),
    ...inventoryAlerts.slice(0, 10),
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
    smartInventorySummary: { currentPeriod, previousPeriod, currentSales, previousSales, salesChangePercent, priorYearPeriod, priorYearSales, yearOverYearChangePercent, staleCount: staleItems.length, lowStockCount: lowStockItems.length, staleItems, lowStockItems },
  };
}


export async function listFavoritePeriodRanges(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(favoritePeriodRanges).where(eq(favoritePeriodRanges.userId, userId)).orderBy(favoritePeriodRanges.sortOrder, desc(favoritePeriodRanges.updatedAt));
}

export async function renameFavoritePeriodRange(input: { userId: number; id: number; name: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(favoritePeriodRanges).set({ name: input.name }).where(and(eq(favoritePeriodRanges.id, input.id), eq(favoritePeriodRanges.userId, input.userId)));
  return { success: true };
}

export async function reorderFavoritePeriodRanges(userId: number, orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const owned = await db.select({ id: favoritePeriodRanges.id }).from(favoritePeriodRanges).where(eq(favoritePeriodRanges.userId, userId));
  const ownedIds = new Set(owned.map((row) => row.id));
  if (orderedIds.some((id) => !ownedIds.has(id)) || new Set(orderedIds).size !== orderedIds.length || orderedIds.length !== owned.length) throw new Error("ترتيب النطاقات غير صالح.");
  for (let index = 0; index < orderedIds.length; index += 1) { const id = orderedIds[index]; await db.update(favoritePeriodRanges).set({ sortOrder: index }).where(and(eq(favoritePeriodRanges.id, id), eq(favoritePeriodRanges.userId, userId))); }
  return { success: true };
}

export async function saveFavoritePeriodRange(input: { userId: number; name: string; fromDate: string; toDate: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [existing] = await db.select().from(favoritePeriodRanges).where(and(eq(favoritePeriodRanges.userId, input.userId), eq(favoritePeriodRanges.name, input.name))).limit(1);
  if (existing) {
    await db.update(favoritePeriodRanges).set({ fromDate: input.fromDate, toDate: input.toDate }).where(eq(favoritePeriodRanges.id, existing.id));
    return { id: existing.id, updated: true };
  }
  const [last] = await db.select({ sortOrder: favoritePeriodRanges.sortOrder }).from(favoritePeriodRanges).where(eq(favoritePeriodRanges.userId, input.userId)).orderBy(desc(favoritePeriodRanges.sortOrder)).limit(1);
  const inserted = await db.insert(favoritePeriodRanges).values({ ...input, sortOrder: Number(last?.sortOrder ?? -1) + 1 });
  return { id: Number(inserted[0].insertId), updated: false };
}

export async function deleteFavoritePeriodRange(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(favoritePeriodRanges).where(and(eq(favoritePeriodRanges.id, id), eq(favoritePeriodRanges.userId, userId)));
  return { success: true };
}

export async function updateFavoritePeriodSettings(input: { userId: number; id: number; isPinned?: boolean; shortcutKey?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [favorite] = await db.select().from(favoritePeriodRanges).where(and(eq(favoritePeriodRanges.id, input.id), eq(favoritePeriodRanges.userId, input.userId))).limit(1);
  if (!favorite) throw new Error("النطاق المفضل غير موجود.");
  if (input.shortcutKey) {
    await db.update(favoritePeriodRanges).set({ shortcutKey: null }).where(and(eq(favoritePeriodRanges.userId, input.userId), eq(favoritePeriodRanges.shortcutKey, input.shortcutKey)));
  }
  if (input.isPinned === true) {
    await db.update(favoritePeriodRanges).set({ isPinned: false }).where(eq(favoritePeriodRanges.userId, input.userId));
  }
  await db.update(favoritePeriodRanges).set({
    ...(input.isPinned === undefined ? {} : { isPinned: input.isPinned }),
    ...(input.shortcutKey === undefined ? {} : { shortcutKey: input.shortcutKey }),
  }).where(and(eq(favoritePeriodRanges.id, input.id), eq(favoritePeriodRanges.userId, input.userId)));
  return { success: true };
}
