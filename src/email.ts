export async function sendEmail(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend returned ${response.status}: ${body.slice(0, 500)}`);
  }
}
