/**
 * GET /api/site-colors?url=example.com, the colours a website's CSS uses.
 *
 * Unlike image extraction this can't run in the browser: cross-origin pages and
 * stylesheets are blocked by CORS, so the server fetches them instead.
 */

import { NextResponse } from "next/server";
import { extractSiteColors } from "@/lib/site-colors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Provide a `url` query parameter" }, { status: 400 });

  try {
    const result = await extractSiteColors(url);
    return NextResponse.json(result, {
      headers: { "cache-control": "public, max-age=600, s-maxage=3600" },
    });
  } catch (error) {
    const { name, message: raw } = error as Error;
    const message =
      name === "TimeoutError"
        ? "The site took too long to respond"
        : raw === "fetch failed"
          ? "Could not connect to that site"
          : raw || "Could not read that site";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
