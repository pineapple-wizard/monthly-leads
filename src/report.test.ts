import assert from "node:assert/strict";
import test from "node:test";
import { periodFromKey } from "./period.ts";
import { buildReport, renderHtml, renderText } from "./report.ts";
import type { Lead } from "./types.ts";

const period = periodFromKey("2026-09");

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    title: "The Ada",
    type: "hotel",
    status: "under_construction",
    expectedOpening: "2027-03-01",
    lastActivityDate: "2026-09-12",
    city: "Dallas",
    note: "Tower crane is up.",
    region: "Texas",
    sources: [{ title: "Dallas Morning News", url: "https://example.com/ada", date: "2026-09-12" }],
    ...overrides,
  };
}

test("the report groups cards under each region", () => {
  const report = buildReport(period, [lead()], []);
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
  );

  assert.equal(report.leads.length, 1);
  assert.deepEqual(
    report.leads[0]?.sources.map((source) => source.url),
    ["https://example.com/ada", "https://example.com/bisnow"],
  );
});

test("card text is escaped", () => {
  const report = buildReport(period, [lead({ title: "A & B <Hotel>" })], []);
  const html = renderHtml(report);
  assert.match(html, /A &amp; B &lt;Hotel&gt;/);
  assert.doesNotMatch(html, /A & B <Hotel>/);
});
