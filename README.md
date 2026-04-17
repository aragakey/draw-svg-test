# draw-webbx-space

一个用 Next.js (App Router) 做的接口 + 前端，代理调用 [draw.webbx.space](https://draw.webbx.space/) 的 `/api/generate` 接口，把用户输入的文字实时变成一幅 SVG 画作。

## 工作原理

1. 浏览器向本地 `POST /api/generate` 发送 `{ subject, locale }`。
2. 服务端路由（`app/api/generate/route.ts`）把请求原样转发到 `https://draw.webbx.space/api/generate`，并把上游的流式响应直接透传给浏览器。
3. 前端按 SSE 风格解析三类事件：
   - `event: thinking` — 模型思考中的文本
   - `event: svg` — SVG 片段（可能多段，拼接为完整图像）
   - `event: tagline` — 画作标题
4. 收齐的 SVG 字符串直接用 `dangerouslySetInnerHTML` 渲染。

## 使用

```bash
npm install
npm run dev
```

然后打开 http://localhost:3000。

## 接口示例

```bash
curl -N -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"subject":"东方明珠","locale":"zh"}'
```

返回的是 `text/event-stream` 流。若上游排队会返回 429 `{activeCount}`，失败返回 JSON `{error}`。

## 说明

- 上游（`draw.webbx.space`）的 LLM 在部分网络区域会返回 403 `"This model is not available in your region."`，此时服务端会透传为 502 + JSON 错误。如在受限区域，请通过可直达的网络环境运行。
- 该项目仅用作对第三方接口的前端外壳，未在本地做任何图像生成。
