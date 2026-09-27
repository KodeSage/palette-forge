/**
 * Pull the colours a website actually uses out of its HTML and CSS.
 *
 * No browser, no screenshot: the page and its stylesheets are fetched as text
 * and every colour literal is counted. Custom properties get special care, since
 * modern sites declare `--brand: #4cc9f0` once and reference it everywhere, so
 * each `var(--brand)` counts as a use of that colour. Near-identical shades are
 * then merged so `#4cc9f0` and `#4dc9f1` don't take two slots.
 *
 * Server-only. The fetches are guarded against SSRF: only public http(s) hosts,
 * every redirect re-checked, bounded time and size.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  distanceSq,
  hslToRgb,
  oklchToRgbClipped,
  rgbToOklab,
  toHex,
  type RGB,
} from "palette-forge";

export interface SiteColor {
  hex: string;
  /** Weighted number of times the colour appears. */
  count: number;
}

export interface SiteColors {
  /** Final URL after redirects. */
  url: string;
  colors: SiteColor[];
  stylesheets: number;
}

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_STYLESHEETS = 12;
const MAX_RESULTS = 24;
/** OKLab distance below which two colours are treated as the same shade. */
const MERGE_DISTANCE = 0.03;
/** Colours below this alpha are overlays and shadows, not palette. */
const MIN_ALPHA = 0.5;
/** A `<meta name="theme-color">` is a deliberate brand statement. */
const THEME_COLOR_WEIGHT = 25;

/* ------------------------------------------------------------ fetching --- */

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80") ||
    v6.startsWith("ff")
  );
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https links are supported");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("That address isn't publicly reachable");
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new Error(`Could not resolve ${host}`);
      });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("That address isn't publicly reachable");
  }
}

/** Fetch text, following redirects by hand so every hop is re-validated. */
async function fetchText(start: URL): Promise<{ url: URL; text: string; type: string }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; PaletteForge/0.1; +https://github.com/KodeSage/palette-forge)",
        accept: "text/html,text/css;q=0.9,*/*;q=0.5",
      },
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      throw new Error(`${url.host} responded ${response.status} ${response.statusText}`.trim());
    }
    return { url, text: await readCapped(response), type: response.headers.get("content-type") ?? "" };
  }
  throw new Error("Too many redirects");
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/* ------------------------------------------------------------- parsing --- */

/** Resolve a CSS number that may be a percentage against `max`. */
function channel(token: string, max: number): number {
  return token.endsWith("%") ? (parseFloat(token) / 100) * max : parseFloat(token);
}

function alphaOf(token: string | undefined): number {
  if (token === undefined) return 1;
  return channel(token, 1);
}

/** Split the inside of `rgb(...)` / `oklch(...)` in legacy or modern syntax. */
function args(inner: string): { parts: string[]; alpha: number } {
  const [main, slashAlpha] = inner.split("/");
  const parts = main!.trim().split(/[\s,]+/).filter(Boolean);
  const alpha = slashAlpha !== undefined ? alphaOf(slashAlpha.trim()) : alphaOf(parts[3]);
  return { parts: parts.slice(0, 3), alpha };
}

const COLOR_RE =
  /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|oklch)\(\s*[^()]*?\)/gi;

/** Parse one colour literal. Null for translucent, `none`, or malformed. */
export function parseColor(literal: string): RGB | null {
  const s = literal.toLowerCase();
  let rgb: RGB;
  let alpha = 1;

  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const full = hex.length <= 4 ? hex.replace(/./g, (c) => c + c) : hex;
    rgb = [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
    if (full.length === 8) alpha = parseInt(full.slice(6, 8), 16) / 255;
  } else {
    const fn = s.slice(0, s.indexOf("("));
    const inner = s.slice(s.indexOf("(") + 1, -1);
    if (inner.includes("var(") || inner.includes("calc(") || inner.includes("from ")) return null;
    const parsed = args(inner);
    if (parsed.parts.length < 3) return null;
    alpha = parsed.alpha;
    const [a, b, c] = parsed.parts as [string, string, string];

    if (fn.startsWith("rgb")) {
      rgb = [channel(a, 255), channel(b, 255), channel(c, 255)];
    } else if (fn.startsWith("hsl")) {
      rgb = hslToRgb([parseFloat(a), parseFloat(b), parseFloat(c)]);
    } else {
      const l = a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
      const chroma = b.endsWith("%") ? (parseFloat(b) / 100) * 0.4 : parseFloat(b);
      rgb = oklchToRgbClipped([l, chroma, parseFloat(c) || 0]);
    }
  }

  if (!Number.isFinite(alpha) || alpha < MIN_ALPHA) return null;
  if (rgb.some((n) => !Number.isFinite(n))) return null;
  return rgb.map((n) => Math.min(255, Math.max(0, Math.round(n)))) as unknown as RGB;
}

/** Count colour literals and custom-property references in a blob of CSS. */
function tally(css: string, counts: Map<string, number>, weight = 1): void {
  // Custom properties declared as a colour: each `var(--x)` is another use.
  const variables = new Map<string, string>();
  const aliases = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;}{]+)/g)) {
    const value = match[2]!.trim();
    const alias = value.match(/^var\(\s*(--[\w-]+)\s*\)$/)?.[1];
    if (alias) {
      aliases.set(match[1]!, alias);
      continue;
    }
    const literal = value.match(COLOR_RE)?.[0];
    if (literal && literal.length >= value.length - 12) {
      const rgb = parseColor(literal);
      if (rgb) variables.set(match[1]!, toHex(rgb));
    }
  }
  // `--color-bg: var(--brand-bg)` chains, resolved a few levels deep.
  for (const [name, target] of aliases) {
    let next: string | undefined = target;
    for (let depth = 0; next && depth < 5 && !variables.has(next); depth++) next = aliases.get(next);
    const hex = next && variables.get(next);
    if (hex && !variables.has(name)) variables.set(name, hex);
  }
  for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const hex = variables.get(match[1]!);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + weight);
  }

  for (const match of css.matchAll(COLOR_RE)) {
    const rgb = parseColor(match[0]);
    if (!rgb) continue;
    const hex = toHex(rgb);
    counts.set(hex, (counts.get(hex) ?? 0) + weight);
  }
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

/** Group near-identical shades, keeping the most-used hex of each group. */
function merge(counts: Map<string, number>): SiteColor[] {
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const groups: { hex: string; lab: readonly number[]; count: number }[] = [];
  const threshold = MERGE_DISTANCE * MERGE_DISTANCE;

  for (const [hex, count] of sorted) {
    const lab = rgbToOklab(hexToRgb(hex));
    const home = groups.find((g) => distanceSq(g.lab as never, lab) < threshold);
    if (home) home.count += count;
    else groups.push({ hex, lab, count });
  }

  return groups
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_RESULTS)
    .map(({ hex, count }) => ({ hex, count: Math.round(count) }));
}

function hexToRgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/* ---------------------------------------------------------------- main --- */

export function normaliseSiteUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a website address");
  try {
    return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("That doesn't look like a web address");
  }
}

export async function extractSiteColors(input: string): Promise<SiteColors> {
  const page = await fetchText(normaliseSiteUrl(input));
  const counts = new Map<string, number>();

  if (page.type.includes("text/css")) {
    tally(page.text, counts);
    return { url: page.url.href, colors: merge(counts), stylesheets: 1 };
  }

  const html = page.text;
  // Strip scripts first: bundles are full of hex strings that never render.
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

  let base = page.url;
  const baseHref = markup.match(/<base\b[^>]*>/i)?.[0];
  if (baseHref) {
    const href = attribute(baseHref, "href");
    if (href) base = new URL(href, page.url);
  }

  for (const tag of markup.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = attribute(tag, "name")?.toLowerCase();
    if (name !== "theme-color" && name !== "msapplication-tilecolor") continue;
    const rgb = parseColor(attribute(tag, "content") ?? "");
    if (rgb) counts.set(toHex(rgb), (counts.get(toHex(rgb)) ?? 0) + THEME_COLOR_WEIGHT);
  }

  // Inline <style> blocks and style="" attributes.
  let css = "";
  for (const match of markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css += match[1] + "\n";
  for (const match of markup.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    css += (match[1] ?? match[2]) + ";\n";
  }

  const hrefs = new Set<string>();
  for (const tag of markup.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attribute(tag, "rel")?.toLowerCase() ?? "";
    const as = attribute(tag, "as")?.toLowerCase();
    if (!rel.split(/\s+/).includes("stylesheet") && !(rel.includes("preload") && as === "style")) {
      continue;
    }
    const href = attribute(tag, "href");
    if (!href) continue;
    try {
      hrefs.add(new URL(href.replace(/&amp;/g, "&"), base).href);
    } catch {
      // Unparseable href, skip it.
    }
  }

  const sheets = await Promise.allSettled(
    [...hrefs].slice(0, MAX_STYLESHEETS).map((href) => fetchText(new URL(href))),
  );
  for (const sheet of sheets) {
    if (sheet.status === "fulfilled") css += sheet.value.text + "\n";
  }

  tally(css, counts);

  const colors = merge(counts);
  if (colors.length === 0) {
    throw new Error("No colours found. The site may render its styles with JavaScript.");
  }
  return {
    url: page.url.href,
    colors,
    stylesheets: sheets.filter((s) => s.status === "fulfilled").length,
  };
}
