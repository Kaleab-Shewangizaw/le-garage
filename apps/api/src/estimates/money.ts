import type { EstimateItemInput } from "@le-garage/validation";

/**
 * Pure, unit-tested money math (docs/SECURITY.md §4, docs/DATABASE.md §2).
 * Every amount is an integer minor unit — never a float.
 */
export function computeItemLineTotal(item: Pick<EstimateItemInput, "quantity" | "unitPrice" | "discount">): number {
  return item.quantity * item.unitPrice - item.discount;
}

export interface EstimateTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
}

export function computeEstimateTotals(items: EstimateItemInput[], taxTotal: number): EstimateTotals {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountTotal = items.reduce((sum, item) => sum + item.discount, 0);
  const total = subtotal - discountTotal + taxTotal;
  return { subtotal, discountTotal, taxTotal, total };
}
