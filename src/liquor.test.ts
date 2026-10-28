import assert from "node:assert/strict";
import test from "node:test";
import { cleanId, issuedQuery, pendingQuery, permitWindow, readIssued, readPending } from "./liquor.ts";

test("a morning run covers yesterday only", () => {
  const window = permitWindow(new Date("2026-10-21T15:00:00Z"));
  assert.equal(window.from, "2026-10-20");
  assert.equal(window.through, "2026-10-20");
  assert.equal(window.before, "2026-10-21");
});

test("late evening Chicago is still that calendar day", () => {
  const window = permitWindow(new Date("2026-10-21T04:00:00Z"));
  assert.equal(window.from, "2026-10-19");
  assert.equal(window.through, "2026-10-19");
  assert.equal(window.before, "2026-10-20");
});

test("an explicit start date runs through today and cannot be after today or impossible", () => {
  const window = permitWindow(new Date("2026-10-21T15:00:00Z"), "2026-10-01");
  assert.equal(window.from, "2026-10-01");
  assert.equal(window.through, "2026-10-21");
  assert.equal(window.before, "2026-10-22");
  assert.throws(() => permitWindow(new Date("2026-10-21T15:00:00Z"), "2026-10-22"), /after today/);
  assert.throws(() => permitWindow(new Date("2026-10-21T15:00:00Z"), "2026-02-31"), /2026-10-20/);
});

test("the pending query uses the renamed application id column", () => {
  const query = pendingQuery(permitWindow(new Date("2026-10-21T15:00:00Z")));
  assert.match(query, /application_id/);
  assert.doesNotMatch(query, /applicationid/);
  assert.match(query, /submission_date >= '2026-10-20' AND submission_date < '2026-10-21'/);
  assert.match(query, /subordinate_license_id IS NULL/);
});

test("pending rows drop subordinate add-ons and trim decimal ids", () => {
  const list = readPending([
    {
      application_id: "667048.0",
      license_type: "MB",
      applicationstatus: "Received",
      subordinate_license_id: null,
      submission_date: "2026-10-20T00:00:00.000",
      trade_name: "1904 The Pub",
      owner: "1904 The Pub",
      address: "2901 N 10th St Unit J",
      city: "Mcallen",
      state: "TX",
      zip: "78503",
    },
    {
      application_id: "1",
      license_type: "FB",
      subordinate_license_id: "99",
      trade_name: "Add-on",
    },
  ]);
  assert.equal(list.count, 1);
  assert.equal(list.rows[0]?.applicationId, "667048");
  assert.equal(list.rows[0]?.licenseTypeLabel, "Mixed Beverage Permit (MB)");
  assert.equal(list.rows[0]?.submissionDate, "2026-10-20");
});

test("issued rows keep food and beverage and late hours flags", () => {
  const query = issuedQuery(permitWindow(new Date("2026-10-21T15:00:00Z")));
  assert.match(query, /original_issue_date/);
  assert.doesNotMatch(query, /current_issued_date/);
  const list = readIssued([
    {
      license_id: "200196095.0",
      trade_name: "3Seventeen Restaurant & Lounge",
      license_type: "MB",
      primary_status: "Active",
      original_issue_date: "2026-10-19T00:00:00.000",
      fb: "1",
      lh: "0",
      phone: "",
    },
  ]);
  assert.equal(list.rows[0]?.licenseId, "200196095");
  assert.equal(list.rows[0]?.foodAndBeverage, true);
  assert.equal(list.rows[0]?.lateHours, false);
  assert.equal(cleanId("200196095.0"), "200196095");
});
