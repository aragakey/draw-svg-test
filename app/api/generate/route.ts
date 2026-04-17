import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UPSTREAM = "https://draw.webbx.space/api/generate";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

/** CORS 预检 */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * 代理 draw.webbx.space 的 /api/generate 接口，流式透传。
 *
 * 成功时返回 text/event-stream，包含三类 SSE 事件：thinking / svg / tagline。
 * 排队时返回 429 JSON { activeCount }。
 * 失败时返回 JSON { error }。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders },
    );
  }

  const { subject, locale } = (body ?? {}) as {
    subject?: unknown;
    locale?: unknown;
  };

  if (typeof subject !== "string" || !subject.trim()) {
    return Response.json(
      { error: "subject is required" },
      { status: 400, headers: corsHeaders },
    );
  }
  const lang = typeof locale === "string" && locale ? locale : "zh";

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Origin: "https://draw.webbx.space",
        Referer: "https://draw.webbx.space/",
      },
      body: JSON.stringify({ subject: subject.trim(), locale: lang }),
      cache: "no-store",
      signal: req.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream fetch failed";
    return Response.json(
      { error: `Upstream unreachable: ${msg}` },
      { status: 502, headers: corsHeaders },
    );
  }

  const headers = new Headers(corsHeaders);
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("cache-control", "no-cache, no-transform");
  headers.set("x-accel-buffering", "no");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
