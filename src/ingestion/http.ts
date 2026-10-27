/**
 * Polite HTTP client for ingestion: identifies itself, obeys robots.txt, rate-limits
 * per host and never attempts to get around auth, CAPTCHAs or paywalls.
 */

export const USER_AGENT =
  process.env.INGEST_USER_AGENT ??
  `CeFacemTimisoaraBot/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com"}/despre)`;

const BOT_TOKEN = "cefacemtimisoarabot";

interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelayMs: number | null;
}

/** Parses robots.txt and returns the rules for our bot (specific group wins over `*`). */
export function parseRobots(txt: string, botToken = BOT_TOKEN): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[]; delay: number | null }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], allow: [], disallow: [], delay: null };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" && val) cur.allow.push(val);
    else if (key === "disallow" && val) cur.disallow.push(val);
    else if (key === "crawl-delay") cur.delay = Number(val) * 1000 || null;
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && botToken.includes(a)));
  const g = specific ?? groups.find((x) => x.agents.includes("*"));
  return { allow: g?.allow ?? [], disallow: g?.disallow ?? [], crawlDelayMs: g?.delay ?? null };
}

function patternToRegex(p: string): RegExp {
  const anchored = p.endsWith("$");
  const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

/** Longest matching rule wins; Allow wins ties (Google semantics). */
export function isAllowedByRobots(rules: RobotsRules, pathWithQuery: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const [list, allow] of [
    [rules.allow, true],
    [rules.disallow, false],
  ] as const) {
    for (const p of list) {
      if (patternToRegex(p).test(pathWithQuery)) {
        if (!best || p.length > best.len || (p.length === best.len && allow)) best = { len: p.length, allow };
      }
    }
  }
  return best ? best.allow : true;
}

const robotsCache = new Map<string, Promise<RobotsRules>>();
const lastRequestAt = new Map<string, number>();
const DEFAULT_DELAY_MS = Number(process.env.INGEST_MIN_DELAY_MS ?? 1500);

async function robotsFor(origin: string): Promise<RobotsRules> {
  if (!robotsCache.has(origin)) {
    robotsCache.set(
      origin,
      (async () => {
        try {
          const r = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
          if (r.status >= 400 && r.status < 500) return { allow: [], disallow: [], crawlDelayMs: null };
          if (!r.ok) return { allow: [], disallow: ["/"], crawlDelayMs: null }; // server error: be conservative
          return parseRobots(await r.text());
        } catch {
          return { allow: [], disallow: ["/"], crawlDelayMs: null };
        }
      })(),
    );
  }
  return robotsCache.get(origin)!;
}

export class RobotsDisallowedError extends Error {}
export class AccessRestrictedError extends Error {}

export async function politeFetch(url: string, init: { accept?: string } = {}): Promise<Response> {
  const u = new URL(url);
  const rules = await robotsFor(u.origin);
  if (!isAllowedByRobots(rules, u.pathname + u.search)) throw new RobotsDisallowedError(`robots.txt disallows ${url}`);

  const delay = Math.max(DEFAULT_DELAY_MS, rules.crawlDelayMs ?? 0);
  const last = lastRequestAt.get(u.host) ?? 0;
  const wait = last + delay - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt.set(u.host, Date.now());

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: init.accept ?? "*/*", "Accept-Language": "ro,en;q=0.8" },
        signal: AbortSignal.timeout(20_000),
        redirect: "follow",
      });
      // Login walls, bot challenges and paywalls are respected: we stop, we do not retry around them.
      if (res.status === 401 || res.status === 403 || res.status === 429 && attempt === 2)
        throw new AccessRestrictedError(`${res.status} for ${url}`);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${res.status} for ${url}`);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        continue;
      }
      return res;
    } catch (e) {
      if (e instanceof AccessRestrictedError) throw e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** HEAD/GET check that a link resolves to a real page (used to verify source & ticket URLs). */
export async function verifyLink(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const res = await fetch(url, { method: "GET", headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch {
    return false;
  }
}
