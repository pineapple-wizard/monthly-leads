import assert from "node:assert/strict";
import test from "node:test";
import { periodFromKey, previousMonth } from "./period.ts";

test("October 1 in Chicago reports September", () => {
  const period = previousMonth(new Date("2026-10-01T13:00:00Z"));
  assert.equal(period.key, "2026-09");
  assert.equal(period.title, "September Leads");
  assert.equal(period.rangeLabel, "September 1–September 30, 2026");
  assert.equal(period.searchAfter, "08/31/2026");
  assert.equal(period.searchBefore, "10/01/2026");
});

test("late September 30 in Chicago still reports August", () => {
  const period = previousMonth(new Date("2026-10-01T04:00:00Z"));
  assert.equal(period.key, "2026-08");
  assert.equal(period.title, "August Leads");
  assert.equal(period.searchAfter, "07/31/2026");
  assert.equal(period.searchBefore, "09/01/2026");
});

test("an explicit month key is accepted", () => {
  const period = periodFromKey("2026-02");
  assert.equal(period.title, "February Leads");
  assert.equal(period.rangeLabel, "February 1–February 28, 2026");
  assert.equal(period.searchAfter, "01/31/2026");
  assert.equal(period.searchBefore, "03/01/2026");
});

test("a bad month key is rejected", () => {
  assert.throws(() => periodFromKey("September"), /2026-09/);
});
