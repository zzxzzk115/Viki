import Link from 'next/link'
import { Icon } from '@/components/icon'
import { LevelBadge } from '@/components/level-badge'
import { getNoteIndex, getSubjects } from '@/lib/content'

export default async function Home() {
  const [notes, subjects] = await Promise.all([getNoteIndex(), getSubjects()])

  const dirs = [...new Set(notes.map((n) => n.subject))].sort(
    (a, b) => (subjects[a]?.order ?? 99) - (subjects[b]?.order ?? 99),
  )

  const recent = [...notes]
    .sort((a, b) => date(b) - date(a))
    .slice(0, 5)

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Viki</h1>
      <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
        个人知识库 · 数学 / 物理 / 计算机 / 图形学
      </p>

      {/* P2 replaces this slot with the 「还记得吗？」 review card. */}

      <section className="mt-12">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">科目</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {dirs.map((d) => {
            const count = notes.filter((n) => n.subject === d).length
            return (
              <Link
                key={d}
                href={`/subjects/${d}/`}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 p-4 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
              >
                <Icon svg={subjects[d]?.iconSvg} className="size-5 text-neutral-400" />
                <span className="font-medium">{subjects[d]?.name ?? d}</span>
                <span className="ml-auto text-sm text-neutral-400">{count} 篇</span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">最近更新</h2>
        <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
          {recent.map((n) => (
            <li key={n.slug} className="py-3">
              <Link href={n.href} className="group flex flex-wrap items-center gap-2">
                <span className="font-medium group-hover:underline">{n.meta.title}</span>
                <LevelBadge level={n.meta.level} />
                <span className="ml-auto text-xs text-neutral-400">
                  {subjects[n.subject]?.name ?? n.subject}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          <Link href="/notes/" className="text-neutral-500 hover:underline">
            全部笔记 →
          </Link>
        </p>
      </section>
    </main>
  )
}

/** JSON round-trips dates to strings; undefined sorts last. */
function date(n: { meta: { updated?: Date; created?: Date } }): number {
  const d = n.meta.updated ?? n.meta.created
  return d ? new Date(d).getTime() : 0
}
