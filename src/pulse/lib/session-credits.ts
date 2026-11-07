// Render decimal strings without passing the original amount through Number.
export function formatSessionCredits(raw: string): string {
  const match = /^([+-]?)(\d*\.?\d+|\d+\.)(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match) return "—";
  const sign = match[1] === "-" ? "-" : "";
  const digits = match[2].replace(".", "");
  if (!/[1-9]/.test(digits)) return "0.00";
  const decimalExact = BigInt(match[2].includes(".") ? match[2].indexOf(".") : match[2].length) + BigInt(match[3] ?? 0);
  const first = digits.search(/[1-9]/);
  const powerExact = decimalExact - BigInt(first) - 1n;
  const significant = digits.slice(first).replace(/0+$/, "");
  if (powerExact < -6n || powerExact > 12n) return `${sign}${significant[0]}${significant.length > 1 ? `.${significant.slice(1, 7)}` : ""}e${powerExact >= 0n ? "+" : ""}${powerExact}`;
  const decimal = Number(decimalExact);
  const power = Number(powerExact);
  const expanded = decimal <= 0 ? `0.${"0".repeat(-decimal)}${digits}`
    : decimal >= digits.length ? `${digits}${"0".repeat(decimal - digits.length)}`
      : `${digits.slice(0, decimal)}.${digits.slice(decimal)}`;
  const [whole, fraction = ""] = expanded.split(".");
  const places = Math.max(2, power < -1 ? -power + 1 : 2);
  // Truncate only the concise display; the tooltip retains the exact amount.
  return `${sign}${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(places, "0").slice(0, places)}`;
}
