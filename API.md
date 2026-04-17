# 灵魂画手 API — 接口文档

通过本接口代理调用 `draw.webbx.space`，根据给定文字生成一幅 SVG 画作。响应为**流式 SSE**（Server-Sent Events 风格），可实时获取思考过程和 SVG 输出。

---

## 基本信息

| 字段 | 值 |
|------|------|
| **Endpoint** | `POST /api/generate` |
| **Base URL** | 部署后的域名，例如 `https://draw-svg-test.vercel.app` |
| **Content-Type（请求）** | `application/json` |
| **Content-Type（响应）** | 成功时 `text/event-stream`；失败时 `application/json` |
| **认证** | 无需认证 |
| **CORS** | 完全开放（`Access-Control-Allow-Origin: *`） |

---

## 请求

### 请求体（JSON）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subject` | `string` | ✅ | 画作主题，例如 `"东方明珠"`、`"a cute cat"` |
| `locale` | `string` | 否 | 语言，`"zh"`（默认）或 `"en"` |

### 示例

```bash
curl -N -X POST https://draw-svg-test.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{"subject": "东方明珠", "locale": "zh"}'
```

---

## 响应

### 成功（HTTP 200，流式）

响应为 **SSE 风格的文本流**，每个事件块之间用空行（`\n\n`）分隔。

每个事件块的格式：

```
event: <type>
data: <content>

```

#### 事件类型

| `event` 值 | 含义 | `data` 内容 |
|------------|------|------------|
| `thinking` | 模型思考过程 | 思考文本片段（增量输出，会有多个 `thinking` 事件） |
| `svg` | SVG 图像片段 | SVG 代码片段（增量输出，需拼接所有 `svg` 事件的 `data` 得到完整 SVG） |
| `tagline` | 画作标题/说明 | 一句话描述 |

#### 流式输出顺序

```
┌─────────────────────┐
│ thinking (多个)      │  ← 模型在思考画什么、怎么画
├─────────────────────┤
│ svg (多个)           │  ← 逐步输出 SVG 代码
├─────────────────────┤
│ tagline (1个)        │  ← 最终的画作标题
└─────────────────────┘
```

#### 完整流示例

```text
event: thinking
data: 让我想想东方明珠的特征...

event: thinking
data: 它有几个球体和一个尖塔...

event: svg
data: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">

event: svg
data: <circle cx="200" cy="150" r="40" fill="#E91E63"/>

event: svg
data: </svg>

event: tagline
data: 东方明珠电视塔
```

> **重要**：多个 `svg` 事件的 `data` 需要按顺序**拼接**为一个完整的 SVG 字符串才能渲染。

---

### 排队中（HTTP 429）

当上游服务繁忙时返回 JSON：

```json
{ "activeCount": 10 }
```

> 建议等待 2 秒后重试。

### 错误（HTTP 4xx / 5xx）

```json
{ "error": "错误信息描述" }
```

常见错误：

| HTTP 状态 | `error` 内容 | 说明 |
|----------|-------------|------|
| 400 | `"Invalid JSON body"` | 请求体不是合法 JSON |
| 400 | `"subject is required"` | 缺少 `subject` 或为空 |
| 502 | `"Upstream unreachable: ..."` | 代理无法连接上游服务 |
| 502 | `"LLM API error 403: ..."` | 上游 LLM 区域限制 |

---

## 消费方式（代码示例）

### JavaScript / TypeScript（浏览器或 Node 18+）

```javascript
async function generate(subject, locale = "zh") {
  const res = await fetch("https://draw-svg-test.vercel.app/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, locale }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let svgParts = [];

  while (true) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: !done });

    // 按空行分隔事件块
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      let type = null, data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }

      if (type === "thinking") console.log("[思考]", data.join("\n"));
      if (type === "svg")      svgParts.push(data.join("\n"));
      if (type === "tagline")  console.log("[标题]", data.join("\n"));
    }

    if (done) break;
  }

  const fullSvg = svgParts.join("");
  console.log("[完整SVG]", fullSvg);
  return fullSvg;
}

generate("东方明珠");
```

### Python

```python
import requests

def generate(subject: str, locale: str = "zh"):
    resp = requests.post(
        "https://draw-svg-test.vercel.app/api/generate",
        json={"subject": subject, "locale": locale},
        stream=True,
    )
    resp.raise_for_status()

    buf, svg_parts = "", []
    for chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
        buf += chunk
        while "\n\n" in buf:
            block, buf = buf.split("\n\n", 1)
            event_type, data_lines = None, []
            for line in block.split("\n"):
                if line.startswith("event:"):
                    event_type = line[6:].strip()
                elif line.startswith("data:"):
                    data_lines.append(line[5:].lstrip())
            content = "\n".join(data_lines)
            if event_type == "thinking":
                print(f"[思考] {content}")
            elif event_type == "svg":
                svg_parts.append(content)
            elif event_type == "tagline":
                print(f"[标题] {content}")

    full_svg = "".join(svg_parts)
    print(f"[完整SVG] {full_svg[:200]}...")
    return full_svg

generate("东方明珠")
```

### curl

```bash
# -N 禁用缓冲，实时看到流式输出
curl -N -X POST https://draw-svg-test.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{"subject": "东方明珠", "locale": "zh"}'
```

---

## 注意事项

1. **流式输出**：响应不是一次性返回的，需要用流式方式读取。
2. **SVG 拼接**：`svg` 事件是增量的，必须把所有 `svg` 事件的 `data` 按顺序拼接。
3. **超时**：生成过程可能需要 10-60 秒，请设置足够长的超时时间。
4. **429 重试**：收到 429 时建议等待 2 秒后重试。
5. **无认证**：接口完全开放，无需 API Key。
