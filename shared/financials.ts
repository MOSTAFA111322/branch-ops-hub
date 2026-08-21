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
