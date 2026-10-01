import type { Lead, Period, SearchDepth, SearchSpec, Source, VenueStatus, VenueType } from "./types.ts";

const VENUE_TYPES = new Set<VenueType>(["hotel", "restaurant", "nightclub", "bar"]);
const VENUE_STATUSES = new Set<VenueStatus>([
  "planned",
  "under_construction",
  "renovation",
  "conversion",
  "opening_soon",
  "opened",
]);

const LEAD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["leads"],
  properties: {
    leads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "type",
          "status",
          "expected_opening",
          "last_activity_date",
          "city",
          "note",
          "source_titles",
        ],
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: ["hotel", "restaurant", "nightclub", "bar"] },
          status: {
            type: "string",
            enum: [
              "planned",
              "under_construction",
              "renovation",
              "conversion",
              "opening_soon",
              "opened",
            ],
          },
          expected_opening: { type: "string" },
          last_activity_date: { type: "string" },
          city: { type: "string" },
          note: { type: "string" },
          source_titles: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = [
  "Extract upcoming hospitality venues from current web coverage.",
  "Return JSON only, matching the schema.",
  "Include a venue only when a source published during the requested window reports that it is planned, under construction, being renovated, being converted, opening soon, or opened during that window.",
  "Hotels, restaurants, nightclubs, and bars count. A lounge or music venue counts as a nightclub only when it operates as nightlife.",
  "Omit venues that have been open for a long time and have no development news in the window.",
  "Do not invent venues, dates, or addresses. If a date is not stated, use \"unknown\".",
  "source_titles must be article or page titles from the search results, not URLs.",
  "If nothing qualifies, return an empty leads array.",
].join(" ");

type DepthSettings = {
  preset: string;
  searchContextSize: "low" | "medium" | "high";
  maxResults: number;
  maxOutputTokens: number;
};

function depthSettings(depth: SearchDepth): DepthSettings {
  if (depth === "heavy") {
    return {
      preset: process.env.LEADS_PRESET_HEAVY || "low",
      searchContextSize: "high",
      maxResults: 12,
      maxOutputTokens: 8000,
    };
  }
  return {
    preset: process.env.LEADS_PRESET_STANDARD || "fast",
    searchContextSize: "medium",
    maxResults: 8,
    maxOutputTokens: 4000,
  };
}

export type SearchRun = {
  leads: Lead[];
  cost: number | null;
};

export async function searchLeads(search: SearchSpec, period: Period, apiKey: string): Promise<SearchRun> {
  const depth = depthSettings(search.depth);
  const payload = {
    preset: depth.preset,
    instructions: INSTRUCTIONS,
    input: buildInput(search, period),
    max_output_tokens: depth.maxOutputTokens,
    tools: [
      {
        type: "web_search",
        search_context_size: depth.searchContextSize,
        max_results: depth.maxResults,
        user_location: search.location,
        filters: {
          search_after_date_filter: period.searchAfter,
          search_before_date_filter: period.searchBefore,
        },
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "hospitality_leads",
        schema: LEAD_SCHEMA,
      },
    },
  };

  const data = await requestWithRetry(payload, apiKey);
  const text = extractText(data);
  const sources = extractSources(data);
  const leads = parseLeads(text, search, sources);
  return { leads, cost: readCost(data) };
}

function buildInput(search: SearchSpec, period: Period): string {
  return [
    `Find hospitality venues in ${search.places}.`,
    `Report window: ${period.rangeLabel}.`,
    `Only include a venue when a source published inside that window supports it.`,
    `Focus: ${search.focus}.`,
    `Set city to the venue's own city.`,
    `Write the note in English, even if the source is in Spanish.`,
    `Copy source_titles from the search result titles. Do not put URLs in the JSON.`,
  ].join("\n");
}

async function requestWithRetry(payload: unknown, apiKey: string): Promise<unknown> {
  const waits = [2_000, 8_000, 20_000];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < waits.length; attempt += 1) {
    try {
      return await requestOnce(payload, apiKey);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable = lastError.message.startsWith("retryable:");
      if (!retryable || attempt === waits.length - 1) {
        throw new Error(lastError.message.replace(/^retryable:\s*/, ""));
      }
      await sleep(waits[attempt]);
    }
  }

  throw lastError ?? new Error("Perplexity request failed");
}

async function requestOnce(payload: unknown, apiKey: string): Promise<unknown> {
  const response = await fetch("https://api.perplexity.ai/v1/agent", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  });

  const body = await response.text();
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`retryable: Perplexity returned ${response.status}: ${body.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`Perplexity returned ${response.status}: ${body.slice(0, 500)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("retryable: Perplexity returned a response that was not JSON");
  }

  const record = asRecord(data);
  const status = typeof record?.status === "string" ? record.status : "";
  if (status === "failed" || status === "incomplete") {
    throw new Error(`retryable: Perplexity run ${status}: ${JSON.stringify(record?.error ?? "").slice(0, 500)}`);
  }
  if (record?.error) {
    throw new Error(`Perplexity error: ${JSON.stringify(record.error).slice(0, 500)}`);
  }
  return data;
}

function parseLeads(text: string, search: SearchSpec, sources: Source[]): Lead[] {
  const parsed = parseJson(text);
  const rows = Array.isArray(parsed.leads) ? parsed.leads : [];
  const leads: Lead[] = [];

  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const title = clean(record.title);
    const type = clean(record.type) as VenueType;
    const status = clean(record.status) as VenueStatus;
    if (!title || !VENUE_TYPES.has(type) || !VENUE_STATUSES.has(status)) continue;

    const sourceTitles = Array.isArray(record.source_titles)
      ? record.source_titles.map((item) => clean(item)).filter(Boolean)
      : [];

    leads.push({
      title,
      type,
      status,
      expectedOpening: clean(record.expected_opening) || "unknown",
      lastActivityDate: clean(record.last_activity_date) || "unknown",
      city: clean(record.city) || search.places,
      note: clean(record.note),
      region: search.region,
      sources: sourcesForLead(title, sourceTitles, sources),
    });
  }

  return leads;
}

function parseJson(text: string): { leads?: unknown[] } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const record = asRecord(parsed);
      if (record && Array.isArray(record.leads)) return { leads: record.leads };
    } catch {
      continue;
    }
  }

  throw new Error("Perplexity response was not a leads JSON object");
}

function sourcesForLead(title: string, sourceTitles: string[], pool: Source[]): Source[] {
  const matched = matchTitles(sourceTitles, pool);
  if (matched.length > 0) return matched.slice(0, 5);

  const tokens = significantTokens(title);
  const related = pool.filter((source) => {
    const haystack = normalize(source.title);
    return tokens.some((token) => haystack.includes(token));
  });
  return (related.length > 0 ? related : []).slice(0, 4);
}

function matchTitles(titles: string[], pool: Source[]): Source[] {
  const used = new Set<string>();
  const matched: Source[] = [];

  for (const title of titles) {
    const wanted = normalize(title);
    if (!wanted) continue;
    const hit = pool.find((source) => {
      if (used.has(source.url)) return false;
      const candidate = normalize(source.title);
      return candidate.includes(wanted) || wanted.includes(candidate);
    });
    if (!hit) continue;
    used.add(hit.url);
    matched.push(hit);
  }

  return matched;
}

function extractText(data: unknown): string {
  const record = asRecord(data);
  if (!record) return "";
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }

  const chunks: string[] = [];
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    const message = asRecord(item);
    if (!message || message.type !== "message" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const content = asRecord(part);
      if (content && typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function extractSources(data: unknown): Source[] {
  const record = asRecord(data);
  const output = record && Array.isArray(record.output) ? record.output : [];
  const sources: Source[] = [];
  const seen = new Set<string>();

  for (const item of output) {
    const entry = asRecord(item);
    if (!entry) continue;
    const results = Array.isArray(entry.results)
      ? entry.results
      : Array.isArray(entry.search_results)
        ? entry.search_results
        : [];
    for (const result of results) {
      const source = asRecord(result);
      if (!source || typeof source.url !== "string" || !source.url || seen.has(source.url)) continue;
      seen.add(source.url);
      sources.push({
        title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : source.url,
        url: source.url,
        date: typeof source.date === "string" ? source.date : null,
      });
    }
  }

  return sources;
}

function readCost(data: unknown): number | null {
  const usage = asRecord(asRecord(data)?.usage);
  const nested = asRecord(usage?.cost);
  const cost = nested?.total_cost ?? usage?.total_cost;
  return typeof cost === "number" ? cost : null;
}

function significantTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 3);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
