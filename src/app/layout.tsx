import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchDialog } from '@/components/search-dialog'
import { TermPopover } from '@/components/term-popover'
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

// A nav link to a route that does not exist is a 404 under `output: 'export'`,
// not a graceful fallback — entries land only once their page does.
// Search is the SearchDialog button rather than a link; /search still exists as
// a deep-linkable page.
const NAV = [
  { href: '/notes/', label: '笔记' },
  { href: '/cards/', label: '复习' },
  { href: '/papers/', label: '论文' },
  { href: '/arxiv/', label: 'arXiv' },
  { href: '/shaders/', label: 'Shader' },
  { href: '/glossary/', label: '术语' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          {/* flex-wrap：7 个链接在窄屏（<500px）会撑破视口，把整页最小宽度
              顶到 ~500px；换行到第二行是唯一不牺牲可达性的收法。 */}
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
            <Link href="/" className="font-bold tracking-tight">
              Viki
            </Link>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-neutral-900 dark:hover:text-neutral-100">
                  {n.label}
                </Link>
              ))}
            </div>
            <SearchDialog />
          </nav>
        </header>

        <div className="flex-1">{children}</div>

        <TermPopover />

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
