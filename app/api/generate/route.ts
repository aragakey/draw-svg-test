import { NextRequest } from "next/server";

// 使用 Edge Runtime：原生支持长连接 / 流式响应，且在 Vercel Hobby 上默认超时更宽松。
export const runtime = "edge";
export const dynamic = "force-dynamic";
// 给流留出足够时间（Vercel Edge 默认 25s，Pro 可最长 300s）。
export const maxDuration = 60;

const UPSTREAM = "https://draw.webbx.space/api/generate";

/**
 * 代理 draw.webbx.space 的 /api/generate 接口。
 *
 * 上游响应为 SSE 风格的流式文本（事件之间用空行分隔，
 * 事件类型包括 thinking / svg / tagline）。
 * 排队时返回 429 JSON { activeCount }；失败时返回 JSON { error }。
 * 这里原样透传，前端自行解析 SSE。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { subject, locale } = (body ?? {}) as {
    subject?: unknown;
    locale?: unknown;
  };

  if (typeof subject !== "string" || !subject.trim()) {
    return Response.json({ error: "subject is required" }, { status: 400 });
  }
  const lang = typeof locale === "string" && locale ? locale : "zh";

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        // 带上来源，绕开潜在的 referer 校验
        Origin: "https://draw.webbx.space",
        Referer: "https://draw.webbx.space/",
      },
      body: JSON.stringify({ subject: subject.trim(), locale: lang }),
      // 让 Next.js 不要缓存
      cache: "no-store",
      signal: req.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream fetch failed";
    return Response.json({ error: `Upstream unreachable: ${msg}` }, {
      status: 502,
    });
  }

  // 保留 content-type（可能是 text/event-stream 或 application/json）
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("cache-control", "no-cache, no-transform");
  headers.set("x-accel-buffering", "no");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
