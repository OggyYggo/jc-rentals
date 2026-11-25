export type AvailabilityKind = "booked" | "held" | "blocked";
export type AvailabilityPeriod = { start: string; end: string; kind: AvailabilityKind };

export function overlapsAvailability(from: string, to: string, periods: AvailabilityPeriod[]) {
  return periods.some(period => period.start <= to && period.end >= from);
}

export function addCalendarDays(day: string, count: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function localCalendarDate(day: string) {
  return new Date(`${day}T00:00:00`);
}

export function calendarDayKey(date: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nextFreeRange(from: string, to: string, through: string, periods: AvailabilityPeriod[]) {
  const duration = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  const latestStart = addCalendarDays(through, -duration);
  let start = from;
  for (const period of [...periods].sort((a, b) => a.start.localeCompare(b.start))) {
    if (period.end < start) continue;
    if (period.start > addCalendarDays(start, duration)) break;
    if (period.end >= latestStart) return null;
    start = addCalendarDays(period.end, 1);
  }
  const end = addCalendarDays(start, duration);
  return start !== from && end <= through ? { start, end } : null;
}
