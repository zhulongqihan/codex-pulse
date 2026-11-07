/** null means at least one required reference price is unavailable. Zero is a known zero. */
export type EstimatedCost = number | null;

export function isKnownCost(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

/** A partial price subtotal must never masquerade as a complete estimate. */
export function sumKnownCosts(values: Iterable<number | null | undefined>): EstimatedCost {
  let total = 0;
  for (const value of values) {
    if (!isKnownCost(value)) return null;
    total += value;
  }
  return Number.isFinite(total) ? total : null;
}

/** Unknown estimates sort after known values in both directions. */
export function compareKnownCosts(a: number | null | undefined, b: number | null | undefined, direction: "asc" | "desc" = "desc") {
  if (!isKnownCost(a)) return isKnownCost(b) ? 1 : 0;
  if (!isKnownCost(b)) return -1;
  return (a - b) * (direction === "asc" ? 1 : -1);
}

export function costPerMillion(cost: EstimatedCost, tokens: number): EstimatedCost {
  return isKnownCost(cost) && tokens > 0 ? cost / tokens * 1_000_000 : null;
}
