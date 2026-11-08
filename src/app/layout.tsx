import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '集刻 Campus Gather · 让相遇发生', description: '校园活动报名与签到 · 本机演示', robots: { index: false, follow: false } };
export default function Layout({ children }: {
    children: React.ReactNode;
}) { return <html lang="zh-CN"><body>{children}</body></html>; }
