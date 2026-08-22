export type NetMarginInputs = {
  grossSales: number;
  salesReturns?: number;
  grossCost: number;
  costReturns?: number;
};

export function calculateNetMargin({ grossSales, salesReturns = 0, grossCost, costReturns = 0 }: NetMarginInputs) {
  const netSales = Math.max(0, grossSales - salesReturns);
  const netCost = Math.max(0, grossCost - costReturns);
  return { netSales, netCost, netProfitMargin: netSales - netCost };
}

export type ComparisonLocation = { id: number; operationalType?: string | null };

export function filterSalesCenters<T extends { operationalType?: string | null }>(locations: T[]) {
  return locations.filter((location) => { const type = location.operationalType ?? "branch"; return type === "branch" || type === "فرع"; });
}
export type ComparisonSnapshot = { branchId: number; periodYear: number; periodMonth: number; operatingExpenses?: unknown; netSales?: unknown; revenue?: unknown; netProfit?: unknown };
export type ComparisonPeriod = { year: number; month: number };

export function aggregateFinancialComparison(locations: ComparisonLocation[], snapshots: ComparisonSnapshot[], currentPeriod: ComparisonPeriod, previousPeriod: ComparisonPeriod) {
  const types = ["branch", "warehouse", "representative"] as const;
  const label = (type: typeof types[number]) => type === "branch" ? "الفروع البيعية" : type === "warehouse" ? "المخازن والمركز الرئيسي" : "المندوبون";
  return types.map(type => {
    const ids = locations.filter(location => (location.operationalType ?? "branch") === type).map(location => location.id);
    const sum = (period: ComparisonPeriod) => snapshots.filter(snapshot => ids.includes(snapshot.branchId) && snapshot.periodYear === period.year && snapshot.periodMonth === period.month).reduce((acc, snapshot) => ({ expenses: acc.expenses + Number(snapshot.operatingExpenses ?? 0), netSales: acc.netSales + Number(snapshot.netSales ?? snapshot.revenue ?? 0), netProfit: acc.netProfit + Number(snapshot.netProfit ?? 0) }), { expenses: 0, netSales: 0, netProfit: 0 });
    const current = sum(currentPeriod);
    const previous = sum(previousPeriod);
    const expenseChange = current.expenses - previous.expenses;
    return { type, label: label(type), current, previous, expenseChange, expenseChangePercent: previous.expenses === 0 ? (current.expenses === 0 ? 0 : null) : (expenseChange / previous.expenses) * 100, locationCount: ids.length };
  });
}

/**
 * Normalizes a signed value from an accounting export into a positive semantic amount.
 * The import schema stores revenue, returns, costs, and expenses in separate fields,
 * so the sign supplied by the source system is metadata rather than arithmetic direction.
 */
export function normalizeImportedAmount(value: unknown): number {
  const raw = String(value ?? "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٬,\s]/g, "").replace(/[٫]/g, ".");
  const parsed = Number(raw.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}
