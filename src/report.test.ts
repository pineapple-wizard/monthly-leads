import assert from "node:assert/strict";
import test from "node:test";
import { periodFromKey } from "./period.ts";
import { buildReport, renderHtml, renderText } from "./report.ts";
import type { Lead } from "./types.ts";

const period = periodFromKey("2026-09");
const asOf = new Date("2026-10-01T15:00:00Z");

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    title: "The Ada",
    type: "hotel",
    status: "under_construction",
    expectedOpening: "2027-03-01",
    lastActivityDate: "2026-09-12",
    city: "Dallas",
    note: "Tower crane is up.",
    alreadyOpen: false,
    region: "Texas",
    sources: [{ title: "Dallas Morning News", url: "https://example.com/ada", date: "2026-09-12" }],
    ...overrides,
  };
}

test("the report groups cards under each region", () => {
  const report = buildReport(period, [lead()], [], asOf);
  const text = renderText(report);
  const html = renderHtml(report);

  assert.match(text, /^September Leads\nSeptember 1–September 30, 2026/);
  assert.match(text, /Texas:\n\nThe Ada\nType: Hotel\nStatus: Under construction/);
  assert.match(text, /Expected opening: March 1, 2027/);
  assert.match(text, /Last activity: September 12, 2026/);
  assert.match(text, /Illinois:\n\nNo leads this month\./);
  assert.match(html, /Texas:/);
  assert.match(html, /Illinois:/);
  assert.match(html, /Tennessee:/);
  assert.match(html, /Puerto Rico:/);
  assert.match(html, /href="https:\/\/example\.com\/ada"/);
});

test("duplicate venues in one run keep a single card and merge sources", () => {
  const report = buildReport(
    period,
    [
      lead(),
      lead({
        note: "",
        sources: [{ title: "Bisnow", url: "https://example.com/bisnow", date: null }],
      }),
    ],
    [],
    asOf,
  );

  assert.equal(report.leads.length, 1);
  assert.deepEqual(
    report.leads[0]?.sources.map((source) => source.url),
    ["https://example.com/ada", "https://example.com/bisnow"],
  );
});

test("card text is escaped", () => {
  const report = buildReport(period, [lead({ title: "A & B <Hotel>" })], [], asOf);
  const html = renderHtml(report);
  assert.match(html, /A &amp; B &lt;Hotel&gt;/);
  assert.doesNotMatch(html, /A & B <Hotel>/);
});

test("venues must be unopened and at least 30 days out", () => {
  const report = buildReport(
    period,
    [
      lead({ title: "Already open", status: "opened", expectedOpening: "2026-09-13" }),
      lead({ title: "Dated opening", status: "opening_soon", expectedOpening: "September 13, 2026" }),
      lead({ title: "Past month", status: "planned", expectedOpening: "September 2026" }),
      lead({ title: "Past quarter", status: "under_construction", expectedOpening: "Q3 2026" }),
      lead({ title: "Too soon", status: "opening_soon", expectedOpening: "October 15, 2026" }),
      lead({ title: "This month", status: "planned", expectedOpening: "October 2026" }),
      lead({ title: "This quarter", status: "planned", expectedOpening: "Q4 2026" }),
      lead({ title: "Twenty nine days", status: "opening_soon", expectedOpening: "2026-10-30" }),
      lead({ title: "Thirty days", status: "opening_soon", expectedOpening: "2026-10-31" }),
      lead({ title: "November", status: "planned", expectedOpening: "November 2026" }),
      lead({ title: "No date", status: "under_construction", expectedOpening: "unknown" }),
      lead({
        title: "Old building, new venue",
        status: "conversion",
        expectedOpening: "2027-06-01",
        alreadyOpen: false,
      }),
      lead({
        title: "Marked open",
        status: "under_construction",
        expectedOpening: "2027-06-01",
        alreadyOpen: true,
      }),
    ],
    [],
    asOf,
  );

  assert.deepEqual(
    report.leads.map((item) => item.title),
    ["Thirty days", "November", "No date", "Old building, new venue"],
  );
});
