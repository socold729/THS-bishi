"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChartNoAxesCombined, LayoutDashboard, ListPlus, SlidersHorizontal, Files, ShieldCheck, Sun } from "lucide-react";
import { usePreferences } from "./providers";
import { STRATEGIES } from "@/lib/domain";
const links = [{ href: "/", name: "每日复盘", en: "Overview", icon: LayoutDashboard }, { href: "/watchlist", name: "我的自选", en: "Watchlist", icon: ListPlus }, { href: "/reports", name: "复盘档案", en: "Reports", icon: Files }, { href: "/settings", name: "复盘配置", en: "Preferences", icon: SlidersHorizontal }];
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { preferences, error } = usePreferences();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="明日游资首页"><span className="brand-mark"><ChartNoAxesCombined size={22} aria-hidden="true" /></span><span><strong>明日游资</strong><small>MINGRI YOUZI</small></span></Link>
      <div className="sidebar-section-label">你的盘后时光</div>
      <nav className="main-nav" aria-label="主导航">{links.map(({ href, name, en, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "nav-link active" : "nav-link"} aria-current={pathname === href ? "page" : undefined}><Icon size={18} aria-hidden="true" /><span>{name}<small>{en}</small></span>{pathname === href && <span className="nav-dot" />}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="quiet-note"><Sun size={20} /><p>收盘之后，<br />让思考慢下来。</p><span>把有限时间，留给重要信息。</span></div><div className="profile"><span className="avatar">我</span><span>个人复盘空间<small>配置保存在当前浏览器</small></span><ArrowUpRight size={15} /></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">我的工作台 <span>/</span> <strong>{links.find(l => l.href === pathname)?.name ?? "每日复盘"}</strong></div><div className="topbar-right"><span className="workspace-status"><span />盘后数据工作台</span><span className="topbar-strategy">{preferences ? STRATEGIES[preferences.style].name : "尚未配置"}</span></div></header>
      <main id="main-content">{error && <div role="alert" className="notice error-notice">{error}</div>}{children}</main>
      <footer className="site-footer"><span><ShieldCheck size={14} />仅供信息整理与研究参考，不构成投资建议。</span><span>事实有来源，判断有边界。 <b>MINGRI YOUZI</b></span></footer>
    </div>
  </div>;
}
