/** Format a USD cost value for display */
export function formatCostUsd(cost: number): string {
  return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`;
}
