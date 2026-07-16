import type { Metadata } from 'next'
import Link from 'next/link'
// Root layout, not per-page: on client navigation a per-page import would let
// equations flash unstyled before the sheet lands.
import 'katex/dist/katex.min.css'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Viki — 个人知识库',
    template: '%s · Viki',
  },
  description: '数学、物理、计算机与图形学的个人知识库，含间隔重复与论文笔记。',
}

// Entries land as their phase does — a nav link to a route that does not exist
// yet is a 404 under `output: 'export'`, not a graceful fallback.
// P3 adds /papers/, P4 /arxiv/, P5 /search/.
const NAV = [
  { href: '/notes/', label: '笔记' },
  { href: '/cards/', label: '复习' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
            <Link href="/" className="font-bold tracking-tight">
              Viki
            </Link>
            <div className="flex gap-4 text-sm text-neutral-600 dark:text-neutral-400">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-neutral-900 dark:hover:text-neutral-100">
                  {n.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-400 dark:border-neutral-800">
          <a
            href="https://github.com/zzxzzk115/Viki"
            className="hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            源码在 GitHub
          </a>
        </footer>
      </body>
    </html>
  )
}
