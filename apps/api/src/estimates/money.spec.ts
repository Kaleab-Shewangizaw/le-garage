import { computeEstimateTotals, computeItemLineTotal } from "./money";

describe("money (docs/DATABASE.md §2 — integer minor units, no floats)", () => {
  it("computes a line total as quantity * unitPrice - discount", () => {
    expect(computeItemLineTotal({ quantity: 3, unitPrice: 500, discount: 100 })).toBe(1400);
  });

  it("computes estimate totals from multiple items plus tax", () => {
    const totals = computeEstimateTotals(
      [
        { type: "PART", description: "Brake pad", quantity: 2, unitPrice: 1000, discount: 0 },
        { type: "LABOR", description: "Install", quantity: 1, unitPrice: 500, discount: 50 },
      ],
      120,
    );
    expect(totals).toEqual({
      subtotal: 2500, // 2*1000 + 1*500
      discountTotal: 50,
      taxTotal: 120,
      total: 2570, // 2500 - 50 + 120
    });
  });

  it("never produces a fractional amount for integer inputs", () => {
    const totals = computeEstimateTotals(
      [{ type: "PART", description: "x", quantity: 3, unitPrice: 333, discount: 1 }],
      0,
    );
    expect(Number.isInteger(totals.total)).toBe(true);
  });
});
