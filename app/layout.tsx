import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "灵魂画手 · Next.js 代理",
  description:
    "通过 Next.js 接口代理 draw.webbx.space，把你的文字变成一幅 SVG 画作。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  );
}
