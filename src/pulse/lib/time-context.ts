/** Display the time zone actually used by a source; never convert date-only keys. */
export function localTimeZone(): string | null {
  try { return new Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
  catch { return null; }
}

export function timeZoneLabel(timezone: string, language: string, at = Date.now()): string {
  try {
    const offset = new Intl.DateTimeFormat(language, {
      timeZone: timezone, timeZoneName: "shortOffset", hour: "numeric",
    }).formatToParts(at).find(part => part.type === "timeZoneName")?.value.replace("GMT", "UTC");
    return !offset || offset === timezone ? timezone : `${timezone} (${offset})`;
  } catch { return timezone; }
}
