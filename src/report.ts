import type { Lead, Period, SearchFailure, Source, VenueStatus, VenueType } from "./types.ts";
import { REGIONS } from "./types.ts";

const TYPE_LABELS: Record<VenueType, string> = {
  hotel: "Hotel",
  restaurant: "Restaurant",
  nightclub: "Nightclub",
  bar: "Bar",
};

const STATUS_LABELS: Record<VenueStatus, string> = {
  planned: "Planned",
  under_construction: "Under construction",
  renovation: "Renovation",
  conversion: "Conversion",
  opening_soon: "Opening soon",
  opened: "Opened",
};

export type Report = {
  period: Period;
  leads: Lead[];
  failures: SearchFailure[];
};

export function buildReport(
  period: Period,
  leads: Lead[],
  failures: SearchFailure[],
  asOf: Date = new Date(),
): Report {
  return {
    period,
    leads: dedupeLeads(leads.filter((lead) => isStillUpcoming(lead, asOf))),
    failures,
  };
}

export function isStillUpcoming(lead: Lead, asOf: Date): boolean {
  if (lead.status === "opened" || lead.alreadyOpen) return false;
  const deadline = openingDeadline(lead.expectedOpening);
  if (!deadline) return true;
  return deadline >= chicagoDay(asOf);
}

export function renderText(report: Report): string {
  const lines: string[] = [report.period.title, report.period.rangeLabel, ""];

  for (const region of REGIONS) {
    lines.push(`${region}:`, "");
    const leads = report.leads.filter((lead) => lead.region === region);
    if (leads.length === 0) {
      lines.push("No leads this month.", "");
      continue;
    }
    for (const lead of leads) {
      lines.push(
        lead.title,
        `Type: ${TYPE_LABELS[lead.type]}`,
        `Status: ${STATUS_LABELS[lead.status]}`,
        `Expected opening: ${displayValue(lead.expectedOpening)}`,
        `Last activity: ${displayValue(lead.lastActivityDate)}`,
        `City: ${lead.city}`,
      );
      if (lead.note) lines.push(lead.note);
      lines.push("Sources:");
      if (lead.sources.length === 0) {
        lines.push("- None matched");
      } else {
        for (const source of lead.sources) {
          lines.push(`- ${source.title} (${source.url})`);
        }
      }
      lines.push("");
    }
  }

  if (report.failures.length > 0) {
    lines.push("Searches that failed:", "");
    for (const failure of report.failures) {
      lines.push(`- ${failure.places}: ${failure.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderHtml(report: Report): string {
  const regions = REGIONS.map((region) => {
    const leads = report.leads.filter((lead) => lead.region === region);
    const body =
      leads.length === 0
        ? `<p style="margin:0 0 24px;color:#555;">No leads this month.</p>`
        : leads.map(renderCard).join("");
    return `<h2 style="margin:28px 0 12px;font-size:20px;">${escapeHtml(region)}:</h2>${body}`;
  }).join("");

  const failures =
    report.failures.length === 0
      ? ""
      : `<h2 style="margin:28px 0 12px;font-size:20px;">Searches that failed:</h2><ul>${report.failures
          .map(
            (failure) =>
              `<li><strong>${escapeHtml(failure.places)}</strong>: ${escapeHtml(failure.message)}</li>`,
          )
          .join("")}</ul>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f6f6;color:#1c1c1c;font-family:Georgia,serif;">
    <div style="max-width:680px;margin:0 auto;background:#fff;padding:28px;border:1px solid #e4e4e4;">
      <h1 style="margin:0;font-size:28px;">${escapeHtml(report.period.title)}</h1>
      <p style="margin:8px 0 0;color:#555;">${escapeHtml(report.period.rangeLabel)}</p>
      ${regions}
      ${failures}
    </div>
  </body>
</html>`;
}

function renderCard(lead: Lead): string {
  const sources =
    lead.sources.length === 0
      ? `<li>None matched</li>`
      : lead.sources.map((source) => `<li>${renderSource(source)}</li>`).join("");

  const note = lead.note
    ? `<p style="margin:8px 0 0;">${escapeHtml(lead.note)}</p>`
    : "";

  return `<article style="border:1px solid #e4e4e4;border-radius:8px;padding:16px;margin:0 0 12px;">
    <h3 style="margin:0 0 8px;font-size:18px;">${escapeHtml(lead.title)}</h3>
    <p style="margin:0;">Type: ${escapeHtml(TYPE_LABELS[lead.type])}</p>
    <p style="margin:4px 0 0;">Status: ${escapeHtml(STATUS_LABELS[lead.status])}</p>
    <p style="margin:4px 0 0;">Expected opening: ${escapeHtml(displayValue(lead.expectedOpening))}</p>
    <p style="margin:4px 0 0;">Last activity: ${escapeHtml(displayValue(lead.lastActivityDate))}</p>
    <p style="margin:4px 0 0;">City: ${escapeHtml(lead.city)}</p>
    ${note}
    <p style="margin:10px 0 4px;">Sources:</p>
    <ul style="margin:0;padding-left:18px;">${sources}</ul>
  </article>`;
}

function renderSource(source: Source): string {
  const label = escapeHtml(source.title);
  if (!/^https?:\/\//i.test(source.url)) return label;
  return `<a href="${escapeHtml(source.url)}">${label}</a>`;
}

export function dedupeLeads(leads: Lead[]): Lead[] {
  const order: Lead[] = [];
  const index = new Map<string, Lead>();

  for (const lead of leads) {
    const key = `${lead.region}|${normalize(lead.city)}|${normalize(lead.title)}`;
    const existing = index.get(key);
    if (!existing) {
      const copy = { ...lead, sources: [...lead.sources] };
      index.set(key, copy);
      order.push(copy);
      continue;
    }
    const seen = new Set(existing.sources.map((source) => source.url));
    for (const source of lead.sources) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      existing.sources.push(source);
    }
    if (!existing.note && lead.note) existing.note = lead.note;
  }

  return order;
}

const MONTH_NUMBERS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function openingDeadline(value: string): string | null {
  const text = value.trim().toLowerCase().replace(/,/g, "");
  if (!text || text === "unknown") return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const monthDayYear = /^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/.exec(text);
  if (monthDayYear) {
    const month = MONTH_NUMBERS[monthDayYear[1] ?? ""];
    if (!month) return null;
    return validDay(Number(monthDayYear[3]), month, Number(monthDayYear[2]));
  }

  const monthYear = /^([a-z]+)\s+(\d{4})$/.exec(text);
  if (monthYear) {
    const month = MONTH_NUMBERS[monthYear[1] ?? ""];
    if (!month) return null;
    return lastDay(Number(monthYear[2]), month);
  }

  const quarter = /^q([1-4])\s+(\d{4})$/.exec(text);
  if (quarter) return lastDay(Number(quarter[2]), Number(quarter[1]) * 3);

  return null;
}

function validDay(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const last = Number(lastDay(year, month).slice(8));
  if (day > last) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDay(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function chicagoDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Could not read the report date.");
  return `${year}-${month}-${day}`;
}

function displayValue(value: string): string {
  if (!value || value.toLowerCase() === "unknown") return "Unknown";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
