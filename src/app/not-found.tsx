import Link from "next/link";
export default function NotFound() { return <div className="empty-state"><h1>这个页面还不存在</h1><p>可以回到复盘工作台继续查看数据。</p><Link href="/">返回首页</Link></div>; }
