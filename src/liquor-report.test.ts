import assert from "node:assert/strict";
import test from "node:test";
import { renderPermitHtml, renderPermitText } from "./liquor-report.ts";
import type { PermitReport } from "./liquor-report.ts";

const report: PermitReport = {
  window: { from: "2026-10-20", through: "2026-10-21", before: "2026-10-22" },
  pending: {
    rows: [
      {
        applicationId: "667048",
        tradeName: "1904 The Pub",
        licenseType: "MB",
        licenseTypeLabel: "Mixed Beverage Permit (MB)",
        applicationStatus: "Received",
        submissionDate: "2026-10-20",
        owner: "1904 The Pub",
        address: "2901 N 10th St Unit J",
        address2: "",
        city: "Mcallen",
        state: "TX",
        zip: "78503",
      },
    ],
    truncated: false,
    count: 1,
    error: null,
  },
  issued: {
    rows: [],
    truncated: false,
    count: 0,
    error: null,
  },
};

test("the permit email lists pending applications before issued licenses", () => {
  const text = renderPermitText(report);
  const html = renderPermitHtml(report);
  const pendingAt = text.indexOf("Pending original applications");
  const issuedAt = text.indexOf("Issued licenses");
  assert.ok(pendingAt >= 0 && issuedAt > pendingAt);
  assert.match(text, /1904 The Pub/);
  assert.match(text, /Mixed Beverage Permit \(MB\)/);
  assert.match(text, /No on-premise licenses were originally issued/);
  assert.match(html, /1904 The Pub/);
  assert.match(html, /Issued licenses/);
});

test("a failed pending search is shown instead of a silent zero", () => {
  const text = renderPermitText({
    ...report,
    pending: { rows: [], truncated: false, count: 0, error: "Texas Open Data request failed (400): application_id" },
  });
  assert.match(text, /Texas Open Data request failed \(400\)/);
  assert.match(text, /0 applications/);
});
