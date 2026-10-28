import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
export const metadata: Metadata = { title: "明日游资 · 你的个性化复盘工作台", description: "明日游资，面向 A 股个人投资者的个性化盘后复盘工作台。真实数据，可追溯证据。" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body><a className="skip-link" href="#main-content">跳转至内容</a><Providers><AppShell>{children}</AppShell></Providers></body></html>;
}
