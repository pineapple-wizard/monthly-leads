import type { Period } from "./types.ts";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const TIME_ZONE = "America/Chicago";

export function previousMonth(now = new Date()): Period {
  const { year, month } = zonedYearMonth(now, TIME_ZONE);
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return periodFor(previous.year, previous.month);
}

export function periodFromKey(key: string): Period {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) {
    throw new Error(`Month must look like 2026-09. Received: ${key}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Month must look like 2026-09. Received: ${key}`);
  }
  return periodFor(year, month);
}

function periodFor(year: number, month: number): Period {
  const name = MONTHS[month - 1];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayBeforeStart = new Date(Date.UTC(year, month - 1, 0));
  const dayAfterEnd = new Date(Date.UTC(year, month, 1));

  return {
    year,
    month,
    key: `${year}-${String(month).padStart(2, "0")}`,
    title: `${name} Leads`,
    rangeLabel: `${name} 1–${name} ${lastDay}, ${year}`,
    searchAfter: formatFilterDate(dayBeforeStart),
    searchBefore: formatFilterDate(dayAfterEnd),
  };
}

function zonedYearMonth(date: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(part(parts, "year"));
  const month = Number(part(parts, "month"));
  return { year, month };
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  const found = parts.find((item) => item.type === type);
  if (!found) {
    throw new Error(`Missing date part: ${type}`);
  }
  return found.value;
}

function formatFilterDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}/${date.getUTCFullYear()}`;
}
