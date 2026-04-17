"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Sparkles, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Locale = "zh" | "en";

type Status = "idle" | "loading" | "streaming" | "done" | "error";

/**
 * 解析上游 SSE 风格协议：事件之间以空行（\r\n\r\n 或 \n\n）分隔。
 * 每个事件块内：`event: <thinking|svg|tagline>`、`data: <content>`。
 */
function findBlockEnd(buf: string): { idx: number; sep: number } {
  const a = buf.indexOf("\r\n\r\n");
  const b = buf.indexOf("\n\n");
  if (a === -1 && b === -1) return { idx: -1, sep: 0 };
  if (a === -1) return { idx: b, sep: 2 };
  if (b === -1) return { idx: a, sep: 4 };
  return a < b ? { idx: a, sep: 4 } : { idx: b, sep: 2 };
}

function parseBlock(
  block: string,
): { type: "thinking" | "svg" | "tagline"; content: string } | null {
  if (!block.trim()) return null;
  let type: "thinking" | "svg" | "tagline" | null = null;
  const dataLines: string[] = [];
  for (const raw of block.split(/\r?\n/)) {
    if (raw.startsWith("event:")) {
      const v = raw.slice(6).trim();
      if (v === "thinking" || v === "svg" || v === "tagline") type = v;
    } else if (raw.startsWith("data:")) {
      let v = raw.slice(5);
      if (v.startsWith(" ")) v = v.slice(1);
      dataLines.push(v);
    }
  }
  if (!type || dataLines.length === 0) return null;
  return { type, content: dataLines.join("\n") };
}

export default function Home() {
  const [subject, setSubject] = useState("");
  const [locale, setLocale] = useState<Locale>("zh");
  const [status, setStatus] = useState<Status>("idle");
  const [thinking, setThinking] = useState("");
  const [svg, setSvg] = useState("");
  const [tagline, setTagline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!subject.trim() || status === "loading" || status === "streaming")
        return;

      setStatus("loading");
      setError(null);
      setThinking("");
      setSvg("");
      setTagline("");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: subject.trim(), locale }),
          signal: ctrl.signal,
        });

        const ct = res.headers.get("content-type") || "";
        if (!res.ok || ct.includes("application/json")) {
          // 错误或非流式响应
          const text = await res.text();
          let msg = text;
          try {
            const j = JSON.parse(text);
            msg = j.error || text;
          } catch {}
          throw new Error(msg || `HTTP ${res.status}`);
        }

        if (!res.body) throw new Error("Empty response body");

        setStatus("streaming");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let svgAcc = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (value) buf += decoder.decode(value, { stream: !done });

          // 处理缓冲区中完整的事件块
          while (true) {
            const { idx, sep } = findBlockEnd(buf);
            if (idx === -1) break;
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + sep);
            const evt = parseBlock(block);
            if (!evt) continue;
            if (evt.type === "thinking") {
              setThinking((t) => t + evt.content);
            } else if (evt.type === "svg") {
              svgAcc += evt.content;
              setSvg(svgAcc);
            } else if (evt.type === "tagline") {
              setTagline(evt.content);
            }
          }

          if (done) {
            const tail = parseBlock(buf);
            if (tail) {
              if (tail.type === "thinking") setThinking((t) => t + tail.content);
              else if (tail.type === "svg") {
                svgAcc += tail.content;
                setSvg(svgAcc);
              } else if (tail.type === "tagline") setTagline(tail.content);
            }
            break;
          }
        }
        setStatus("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("idle");
          return;
        }
        setError((err as Error).message);
        setStatus("error");
      } finally {
        abortRef.current = null;
      }
    },
    [subject, locale, status],
  );

  const busy = status === "loading" || status === "streaming";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">灵魂画手</h1>
        <p className="text-sm text-muted-foreground">
          输入一段文字，通过 Next.js 后端接口调用{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            draw.webbx.space/api/generate
          </code>{" "}
          生成一幅 SVG 画作。
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={locale === "zh" ? "想画点什么？例如：东方明珠" : "What to draw?"}
          disabled={busy}
          className="flex-1"
        />
        <div className="flex gap-2">
          <div className="inline-flex rounded-md border border-input bg-background p-0.5 text-sm">
            {(["zh", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                disabled={busy}
                className={cn(
                  "rounded px-3 py-1.5 transition-colors",
                  locale === l
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {busy ? (
            <Button type="button" variant="outline" onClick={stop}>
              <Square className="h-4 w-4" />
              停止
            </Button>
          ) : (
            <Button type="submit" disabled={!subject.trim()}>
              <Sparkles className="h-4 w-4" />
              画！
            </Button>
          )}
        </div>
      </form>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-muted/30">
            {svg ? (
              <div
                className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                // 上游返回的 SVG 字符串，直接渲染
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                {busy ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>
                      {status === "loading" ? "正在连接…" : "正在作画…"}
                    </span>
                  </>
                ) : (
                  <span>你的画作将出现在这里</span>
                )}
              </div>
            )}
          </div>
          {tagline && (
            <div className="border-t p-4 text-center text-sm font-medium">
              {tagline}
            </div>
          )}
        </CardContent>
      </Card>

      {thinking && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              思考过程
            </div>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {thinking}
            </pre>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
