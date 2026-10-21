import { mkdir, writeFile } from "node:fs/promises";
import { sendEmail } from "./email.ts";
import { loadEnvFile } from "./env.ts";
import { renderPermitHtml, renderPermitText } from "./liquor-report.ts";
import { fetchPermits, permitWindow } from "./liquor.ts";

loadEnvFile();

const from = parseFrom(process.argv.slice(2));
const noEmail = process.argv.includes("--no-email");
const window = permitWindow(new Date(), from);
const keyId = process.env.API_KEY_ID_TX_OPEN_DATA_PORTAL;
const keySecret = process.env.API_KEY_SECRET_TX_OPEN_DATA_PORTAL;
if (!keyId || !keySecret) {
  throw new Error("Set API_KEY_ID_TX_OPEN_DATA_PORTAL and API_KEY_SECRET_TX_OPEN_DATA_PORTAL.");
}

console.log(`Texas liquor permits (${window.from} through ${window.through})`);
const { pending, issued } = await fetchPermits(window, keyId, keySecret);
console.log(`Pending: ${pending.error ? `failed (${pending.error})` : pending.count}`);
console.log(`Issued: ${issued.error ? `failed (${issued.error})` : issued.count}`);

const report = { window, pending, issued };
const html = renderPermitHtml(report);
const text = renderPermitText(report);

await mkdir("out", { recursive: true });
const stem = `out/permits-${window.from}`;
await writeFile(`${stem}.json`, JSON.stringify(report, null, 2));
await writeFile(`${stem}.html`, html);
await writeFile(`${stem}.txt`, text);
console.log(`Wrote ${stem}.html`);

if (noEmail) {
  console.log("Skipped email.");
} else {
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.REPORT_TO;
  if (!resendKey || !to) {
    throw new Error("Set RESEND_API_KEY and REPORT_TO, or pass --no-email.");
  }
  const fromAddress = process.env.REPORT_FROM || "Monthly Leads <onboarding@resend.dev>";
  const subject =
    window.from === window.through
      ? `Texas liquor permits, ${window.from}`
      : `Texas liquor permits, ${window.from} through ${window.through}`;
  await sendEmail({
    apiKey: resendKey,
    from: fromAddress,
    to,
    subject,
    html,
    text,
  });
  console.log(`Emailed ${to}`);
}

if (pending.error || issued.error) {
  process.exitCode = 1;
}

function parseFrom(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--from") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--from needs a value");
      return value;
    }
    if (arg !== "--no-email") throw new Error(`Unknown argument: ${arg}`);
  }
  return undefined;
}
