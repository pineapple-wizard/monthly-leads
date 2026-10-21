import type { IssuedLicense, PendingApplication, PermitList, PermitWindow } from "./liquor.ts";

export type PermitReport = {
  window: PermitWindow;
  pending: PermitList<PendingApplication>;
  issued: PermitList<IssuedLicense>;
};

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

export function renderPermitText(report: PermitReport): string {
  const lines = [
    "Texas liquor permits",
    rangeLabel(report.window),
    "",
    pendingHeading(report),
    "",
    "On-premise primaries only: bars, restaurants, hotels, clubs, and brewpubs. Late-hours and food-and-beverage add-ons are left out so the same place is not listed again. Gas stations, package stores, and one-day nonprofit events are left out.",
    "",
  ];
  pushPending(lines, report.pending);
  lines.push("", issuedHeading(report), "");
  pushIssued(lines, report.issued);
  return lines.join("\n");
}

export function renderPermitHtml(report: PermitReport): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f6f6;color:#1c1c1c;font-family:Georgia,serif;">
    <div style="max-width:920px;margin:0 auto;background:#fff;padding:28px;border:1px solid #e4e4e4;">
      <h1 style="margin:0;font-size:28px;">Texas liquor permits</h1>
      <p style="margin:8px 0 0;color:#555;">${escapeHtml(rangeLabel(report.window))}</p>
      <h2 style="margin:28px 0 8px;font-size:20px;">${escapeHtml(pendingHeading(report))}</h2>
      <p style="margin:0 0 16px;color:#555;">On-premise primaries only: bars, restaurants, hotels, clubs, and brewpubs. Late-hours and food-and-beverage add-ons are left out so the same place is not listed again. Gas stations, package stores, and one-day nonprofit events are left out.</p>
      ${pendingBody(report.pending)}
      <h2 style="margin:28px 0 8px;font-size:20px;">${escapeHtml(issuedHeading(report))}</h2>
      ${issuedBody(report.issued)}
    </div>
  </body>
</html>`;
}

function pendingHeading(report: PermitReport): string {
  const count = report.pending.error ? 0 : report.pending.count;
  const noun = count === 1 ? "application" : "applications";
  return `Pending original applications · submitted ${report.window.from} through ${report.window.through} · ${count} ${noun}`;
}

function issuedHeading(report: PermitReport): string {
  const count = report.issued.error ? 0 : report.issued.count;
  const noun = count === 1 ? "license" : "licenses";
  return `Issued licenses · originally issued ${report.window.from} through ${report.window.through} · ${count} ${noun}`;
}

function pushPending(lines: string[], list: PermitList<PendingApplication>): void {
  if (list.error) {
    lines.push(list.error, "", "No on-premise applications were submitted in this range.");
    return;
  }
  if (list.truncated) lines.push("This list stopped at 1,000 rows. Use a later start date.", "");
  if (list.rows.length === 0) {
    lines.push("No on-premise applications were submitted in this range.");
    return;
  }
  for (const row of list.rows) {
    lines.push(
      row.tradeName || "Unnamed application",
      `License type: ${row.licenseTypeLabel}`,
      `Status: ${row.applicationStatus || "Unknown"}`,
      `Submitted: ${displayDate(row.submissionDate)}`,
      `Owner: ${row.owner || "Unknown"}`,
      `Address: ${place(row)}`,
      "",
    );
  }
}

function pushIssued(lines: string[], list: PermitList<IssuedLicense>): void {
  if (list.error) {
    lines.push(list.error, "", "No on-premise licenses were originally issued in this range.");
    return;
  }
  if (list.truncated) lines.push("This list stopped at 1,000 rows. Use a later start date.", "");
  if (list.rows.length === 0) {
    lines.push("No on-premise licenses were originally issued in this range.");
    return;
  }
  for (const row of list.rows) {
    lines.push(
      row.tradeName || "Unnamed license",
      `License type: ${row.licenseTypeLabel}`,
      `Original issue date: ${displayDate(row.originalIssueDate)}`,
      `Primary status: ${row.primaryStatus || "Unknown"}`,
      `Owner: ${row.owner || "Unknown"}`,
      `Address: ${place(row)}`,
      `Phone: ${row.phone || "—"}`,
      `Food and beverage: ${yesNo(row.foodAndBeverage)}`,
      `Late hours: ${yesNo(row.lateHours)}`,
      "",
    );
  }
}

function pendingBody(list: PermitList<PendingApplication>): string {
  if (list.error) {
    return `<p>${escapeHtml(list.error)}</p><p>No on-premise applications were submitted in this range.</p>`;
  }
  if (list.rows.length === 0) return `<p>No on-premise applications were submitted in this range.</p>`;
  const notice = list.truncated ? `<p>This list stopped at 1,000 rows. Use a later start date.</p>` : "";
  const body = list.rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.tradeName)}</td>
        <td>${escapeHtml(row.licenseTypeLabel)}</td>
        <td>${escapeHtml(row.applicationStatus)}</td>
        <td>${escapeHtml(displayDate(row.submissionDate))}</td>
        <td>${escapeHtml(row.owner)}</td>
        <td>${escapeHtml(place(row))}</td>
      </tr>`,
    )
    .join("");
  return `${notice}<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr>${headers(["Trade name", "License type", "Status", "Submitted", "Owner", "Address"])}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function issuedBody(list: PermitList<IssuedLicense>): string {
  if (list.error) {
    return `<p>${escapeHtml(list.error)}</p><p>No on-premise licenses were originally issued in this range.</p>`;
  }
  if (list.rows.length === 0) return `<p>No on-premise licenses were originally issued in this range.</p>`;
  const notice = list.truncated ? `<p>This list stopped at 1,000 rows. Use a later start date.</p>` : "";
  const body = list.rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.tradeName)}</td>
        <td>${escapeHtml(row.licenseTypeLabel)}</td>
        <td>${escapeHtml(displayDate(row.originalIssueDate))}</td>
        <td>${escapeHtml(row.primaryStatus)}</td>
        <td>${escapeHtml(row.owner)}</td>
        <td>${escapeHtml(place(row))}</td>
        <td>${escapeHtml(row.phone || "—")}</td>
        <td>${yesNo(row.foodAndBeverage)}</td>
        <td>${yesNo(row.lateHours)}</td>
      </tr>`,
    )
    .join("");
  return `${notice}<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr>${headers(["Trade name", "License type", "Original issue date", "Primary status", "Owner", "Address", "Phone", "Food and beverage", "Late hours"])}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function headers(labels: string[]): string {
  return labels
    .map(
      (label) =>
        `<th style="text-align:left;border-bottom:1px solid #ccc;padding:6px;vertical-align:top;">${escapeHtml(label)}</th>`,
    )
    .join("");
}

function place(row: { address: string; address2: string; city: string; state: string; zip: string }): string {
  const street = [row.address, row.address2].filter(Boolean).join(", ");
  const region = [row.city, row.state].filter(Boolean).join(", ");
  return [street, region, row.zip].filter(Boolean).join(" ");
}

function rangeLabel(window: PermitWindow): string {
  if (window.from === window.through) return displayDate(window.from);
  return `${displayDate(window.from)} – ${displayDate(window.through)}`;
}

function displayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso || "Unknown";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
