/** All money in this app comes from the API as integer minor units (docs/DATABASE.md §2) — never format a float. */
export function formatMoney(minorUnits: number, currency: string = "ETB"): string {
  const major = minorUnits / 100;
  return `${currency} ${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatMileage(km: number | null | undefined): string {
  if (km == null) return "—";
  return `${km.toLocaleString("en-US")} km`;
}
