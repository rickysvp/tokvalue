export const REPORT_CACHE_HOURS = 7 * 24

/** A paid report is reusable for everyone who unlocks it, including partial-data reports. */
export function isReusablePaidReport(
  report: { computedAt: string | Date; isFree?: boolean | null; dataQuality?: string | null },
  now = Date.now(),
): boolean {
  if (report.isFree !== false) return false
  const age = now - new Date(report.computedAt).getTime()
  return Number.isFinite(age) && age >= 0 && age < REPORT_CACHE_HOURS * 3600_000
}
