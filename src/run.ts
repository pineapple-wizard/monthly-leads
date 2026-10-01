import { mkdir, writeFile } from "node:fs/promises";
import { sendEmail } from "./email.ts";
import { searchLeads } from "./perplexity.ts";
import { periodFromKey, previousMonth } from "./period.ts";
import { buildReport, renderHtml, renderText } from "./report.ts";
import { SEARCHES } from "./searches.ts";
import type { Lead, SearchFailure } from "./types.ts";
import { loadEnvFile } from "./env.ts";

loadEnvFile();

const args = parseArgs(process.argv.slice(2));
const period = args.month ? periodFromKey(args.month) : previousMonth();
const searches = args.only ? SEARCHES.filter((search) => search.id === args.only) : SEARCHES;

if (args.only && searches.length === 0) {
  const ids = SEARCHES.map((search) => search.id).join(", ");
  throw new Error(`Unknown search "${args.only}". Available: ${ids}`);
}

const apiKey = process.env.PERPLEXITY_API_KEY;
if (!apiKey) {
  throw new Error("Set PERPLEXITY_API_KEY.");
}

const concurrency = positiveInt(process.env.LEADS_CONCURRENCY, 2);
console.log(`${period.title} (${period.rangeLabel})`);
console.log(`${searches.length} searches, ${concurrency} at a time`);

const leads: Lead[] = [];
const failures: SearchFailure[] = [];
let cost = 0;
let pricedCalls = 0;

await mapPool(searches, concurrency, async (search) => {
  console.log(`start ${search.id}`);
  try {
    const result = await searchLeads(search, period, apiKey);
    leads.push(...result.leads);
    if (result.cost !== null) {
      cost += result.cost;
      pricedCalls += 1;
    }
    console.log(`done ${search.id}: ${result.leads.length} leads`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({
      id: search.id,
      region: search.region,
      places: search.places,
      message,
    });
    console.error(`failed ${search.id}: ${message}`);
  }
});

const report = buildReport(period, leads, failures);
const html = renderHtml(report);
const text = renderText(report);

await mkdir("out", { recursive: true });
await writeFile(`out/${period.key}.json`, JSON.stringify(report, null, 2));
await writeFile(`out/${period.key}.html`, html);
await writeFile(`out/${period.key}.txt`, text);

console.log(`${report.leads.length} leads, ${failures.length} failed searches`);
if (pricedCalls > 0) {
  console.log(`Perplexity cost reported on ${pricedCalls} calls: $${cost.toFixed(4)}`);
}
console.log(`Wrote out/${period.key}.html`);

if (args.noEmail) {
  console.log("Skipped email.");
} else {
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.REPORT_TO;
  if (!resendKey || !to) {
    throw new Error("Set RESEND_API_KEY and REPORT_TO, or pass --no-email.");
  }
  const from = process.env.REPORT_FROM || "Monthly Leads <onboarding@resend.dev>";
  await sendEmail({
    apiKey: resendKey,
    from,
    to,
    subject: period.title,
    html,
    text,
  });
  console.log(`Emailed ${to}`);
}

function parseArgs(argv: string[]): { month?: string; only?: string; noEmail: boolean } {
  let month: string | undefined;
  let only: string | undefined;
  let noEmail = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--month") {
      month = requiredValue(argv, ++index, "--month");
    } else if (arg === "--only") {
      only = requiredValue(argv, ++index, "--only");
    } else if (arg === "--no-email") {
      noEmail = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { month, only, noEmail };
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} needs a value`);
  }
  return value;
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`LEADS_CONCURRENCY must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const current = next;
      next += 1;
      await worker(items[current]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
}
