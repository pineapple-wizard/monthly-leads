const TIME_ZONE = "America/Chicago";

export const LICENSE_TYPES = ["MB", "BG", "BE", "N", "NB", "NE", "BP"] as const;

const LICENSE_LABELS: Record<string, string> = {
  MB: "Mixed Beverage Permit",
  BG: "Wine and Malt Beverage Retailer's Permit",
  BE: "Retail Dealer's On-Premise License",
  N: "Private Club Registration Permit",
  NB: "Private Club Malt Beverage and Wine Permit",
  NE: "Private Club Exemption Certificate",
  BP: "Brewpub License",
};

const PAGE_SIZE = 1000;
const PENDING_URL = "https://data.texas.gov/api/v3/views/mxm5-tdpj/query.json";
const ISSUED_URL = "https://data.texas.gov/api/v3/views/7hf9-qc9f/query.json";

export type PermitWindow = {
  from: string;
  through: string;
  before: string;
};

export type PendingApplication = {
  applicationId: string;
  tradeName: string;
  licenseType: string;
  licenseTypeLabel: string;
  applicationStatus: string;
  submissionDate: string;
  owner: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
};

export type IssuedLicense = {
  licenseId: string;
  tradeName: string;
  licenseType: string;
  licenseTypeLabel: string;
  originalIssueDate: string;
  primaryStatus: string;
  owner: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  foodAndBeverage: boolean;
  lateHours: boolean;
};

export type PermitList<T> = {
  rows: T[];
  truncated: boolean;
  count: number;
  error: string | null;
};

export function permitWindow(now = new Date(), fromKey?: string): PermitWindow {
  const today = chicagoDay(now);
  const yesterday = addDays(today, -1);
  const from = fromKey ?? yesterday;
  const through = fromKey ? today : yesterday;
  assertRealDay(from, "Start date");
  if (from > through) {
    throw new Error("Start date cannot be after today.");
  }
  return { from, through, before: addDays(through, 1) };
}

export function pendingQuery(window: PermitWindow): string {
  return [
    "SELECT application_id, license_type, applicationstatus, primary_license_id, subordinate_license_id, submission_date, trade_name, owner, address, address_2, city, state, zip",
    `WHERE submission_date >= '${window.from}' AND submission_date < '${window.before}'`,
    `  AND license_type IN (${licenseList()})`,
    "  AND subordinate_license_id IS NULL",
    "ORDER BY submission_date DESC, trade_name ASC",
  ].join("\n");
}

export function issuedQuery(window: PermitWindow): string {
  return [
    "SELECT license_id, trade_name, license_type, primary_status, original_issue_date, owner, address, address_2, city, state, zip, phone, county, subordinates, fb, lh",
    `WHERE original_issue_date >= '${window.from}' AND original_issue_date < '${window.before}'`,
    `  AND license_type IN (${licenseList()})`,
    "ORDER BY original_issue_date DESC, trade_name ASC",
  ].join("\n");
}

export function readPending(data: unknown): PermitList<PendingApplication> {
  const rows = readRows(data)
    .filter((row) => !text(row.subordinate_license_id))
    .map((row) => ({
      applicationId: cleanId(row.application_id),
      tradeName: text(row.trade_name),
      licenseType: text(row.license_type),
      licenseTypeLabel: licenseLabel(text(row.license_type)),
      applicationStatus: text(row.applicationstatus),
      submissionDate: cleanDate(row.submission_date),
      owner: text(row.owner),
      address: text(row.address),
      address2: text(row.address_2),
      city: text(row.city),
      state: text(row.state),
      zip: text(row.zip),
    }));
  return list(rows);
}

export function readIssued(data: unknown): PermitList<IssuedLicense> {
  const rows = readRows(data).map((row) => ({
    licenseId: cleanId(row.license_id),
    tradeName: text(row.trade_name),
    licenseType: text(row.license_type),
    licenseTypeLabel: licenseLabel(text(row.license_type)),
    originalIssueDate: cleanDate(row.original_issue_date),
    primaryStatus: text(row.primary_status),
    owner: text(row.owner),
    address: text(row.address),
    address2: text(row.address_2),
    city: text(row.city),
    state: text(row.state),
    zip: text(row.zip),
    phone: text(row.phone),
    foodAndBeverage: flag(row.fb),
    lateHours: flag(row.lh),
  }));
  return list(rows);
}

export async function fetchPermits(
  window: PermitWindow,
  keyId: string,
  keySecret: string,
): Promise<{ pending: PermitList<PendingApplication>; issued: PermitList<IssuedLicense> }> {
  const [pending, issued] = await Promise.all([
    fetchList(PENDING_URL, pendingQuery(window), keyId, keySecret, readPending),
    fetchList(ISSUED_URL, issuedQuery(window), keyId, keySecret, readIssued),
  ]);
  return { pending, issued };
}

export function licenseLabel(code: string): string {
  const name = LICENSE_LABELS[code];
  return name ? `${name} (${code})` : code;
}

function licenseList(): string {
  return LICENSE_TYPES.map((type) => `'${type}'`).join(",");
}

async function fetchList<T>(
  url: string,
  query: string,
  keyId: string,
  keySecret: string,
  read: (data: unknown) => PermitList<T>,
): Promise<PermitList<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        page: { pageNumber: 1, pageSize: PAGE_SIZE },
        includeSystem: false,
        includeSynthetic: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.text();
    if (!response.ok) {
      return empty(`Texas Open Data request failed (${response.status}): ${body.slice(0, 500)}`);
    }
    return read(JSON.parse(body) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return empty(message);
  }
}

function list<T>(rows: T[]): PermitList<T> {
  return {
    rows,
    truncated: rows.length >= PAGE_SIZE,
    count: rows.length,
    error: null,
  };
}

function empty<T>(error: string): PermitList<T> {
  return { rows: [], truncated: false, count: 0, error };
}

function readRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) {
    throw new Error("Texas Open Data returned a response that was not a list.");
  }
  return data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
}

export function cleanId(value: unknown): string {
  return text(value).replace(/\.0$/, "");
}

function cleanDate(value: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(value));
  return match?.[1] ?? "";
}

function flag(value: unknown): boolean {
  return text(value) === "1";
}

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function chicagoDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Could not read the Chicago date.");
  return `${year}-${month}-${day}`;
}

function addDays(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assertRealDay(iso: string, label: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`${label} must look like 2026-10-20.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!real) throw new Error(`${label} must look like 2026-10-20.`);
}
