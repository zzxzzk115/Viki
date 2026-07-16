/**
 * Compiles content/ into static JSON that pages read at build time.
 *
 * Runs as a plain CLI step rather than a bundler plugin: Turbopack is Next 16's
 * default and does not run webpack plugins, so a bundler-coupled pipeline would
 * be a standing liability. Cost: `pnpm dev` does not re-index on content edits —
 * run `pnpm content:watch` alongside it.
 *
 * Every note compiles exactly once here, not once per route, which keeps shiki
 * and KaTeX out of the client bundle entirely.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import fg from 'fast-glob'
import matter from 'gray-matter'
import { z } from 'zod'
import { resolveIcon } from '../src/lib/icons'
import { countWords, render, renderFragment } from '../src/lib/pipeline'
import { createIndex, type SearchDoc } from '../src/lib/search'
import { hashSlug } from '../src/lib/slug'
import {
  Glossary,
  NoteMeta,
  PaperMeta,
  SubjectMeta,
  type Card,
  type Note,
  type NoteIndexEntry,
  type Paper,
  type Subject,
  type Term,
} from '../src/lib/schema'

const ROOT = process.cwd()
const CONTENT = join(ROOT, 'content')
const GENERATED = join(ROOT, '.generated')
const PUBLIC_DATA = join(ROOT, 'public', 'data')


const IS_DEV = process.env.NODE_ENV !== 'production' && process.env.CI !== 'true'

/** Collected then reported together: fixing one typo per build is miserable. */
const problems: string[] = []
const warnings: string[] = []

function report(file: string, err: z.ZodError) {
  for (const issue of err.issues) {
    const path = issue.path.length ? issue.path.join('.') : '(根)'
    problems.push(`  ${file}\n    ${path}: ${issue.message}`)
  }
}

/** content/math/linear-algebra/svd.md -> { subject: 'math', slug: 'math/linear-algebra/svd' } */
function identify(absPath: string) {
  const rel = relative(CONTENT, absPath).split(sep).join('/')
  const slug = rel.replace(/\.mdx?$/, '')
  return { rel, slug, subject: slug.split('/')[0] }
}

async function loadSubjects() {
  const files = await fg('*/_subject.yml', { cwd: CONTENT, absolute: true })
  const subjects: Record<string, Subject> = {}
  for (const f of files) {
    const dir = relative(CONTENT, dirname(f)).split(sep).join('/')
    const file = `content/${dir}/_subject.yml`
    // gray-matter needs frontmatter delimiters; a bare .yml has none.
    const raw = await readFile(f, 'utf8')
    const res = SubjectMeta.safeParse(matter(`---\n${raw}\n---\n`).data)
    if (!res.success) {
      report(file, res.error)
      continue
    }
    let iconSvg: string | undefined
    if (res.data.icon) {
      try {
        iconSvg = resolveIcon(res.data.icon)
      } catch (e) {
        // A misspelled icon should name itself, not vanish into a blank slot.
        problems.push(`  ${file}\n    icon: ${e instanceof Error ? e.message : String(e)}`)
        continue
      }
    }
    subjects[dir] = { ...res.data, dir, iconSvg }
  }
  return subjects
}

async function loadGlossary(): Promise<Glossary> {
  const file = 'content/_glossary.yml'
  const raw = await readFile(join(CONTENT, '_glossary.yml'), 'utf8')
  // gray-matter needs frontmatter delimiters; a bare .yml has none.
  const res = Glossary.safeParse(matter(`---\n${raw}\n---\n`).data)
  if (!res.success) {
    report(file, res.error)
    return {}
  }
  return res.data
}

/**
 * Card ids are the localStorage primary key, so their stability decides whether
 * a review history survives an edit.
 *
 * Hashes the markdown SOURCE text, never rendered HTML: KaTeX and shiki output
 * is not stable across their own version bumps, so hashing HTML would silently
 * orphan every card's history on an unrelated dependency upgrade.
 *
 * Hashing the question (not the answer) means editing an answer — the common
 * edit — keeps history, while rewording a question drops it. That is right: it
 * is a different card. Pin {id=...} on cards you expect to reword.
 */
function cardId(explicit: string | undefined, noteSlug: string, questionSource: string): string {
  if (explicit) return explicit
  const normalized = questionSource.replace(/\s+/g, ' ').trim()
  return createHash('sha1').update(`${noteSlug}::${normalized}`).digest('hex').slice(0, 10)
}

async function main() {
  const t0 = Date.now()

  const paths = await fg('**/*.{md,mdx}', { cwd: CONTENT, absolute: true, ignore: ['**/_*'] })
  const [subjects, glossary] = await Promise.all([loadSubjects(), loadGlossary()])

  // Pass 1: the slug table. Wiki-links resolve against every note in the repo,
  // so no file can compile until all slugs are known.
  const titles = new Map<string, string>()
  const parsed: {
    rel: string
    slug: string
    subject: string
    data: unknown
    content: string
  }[] = []

  for (const abs of paths) {
    const { rel, slug, subject } = identify(abs)
    const { data, content } = matter(await readFile(abs, 'utf8'))
    parsed.push({ rel, slug, subject, data, content })
    const t = (data as { title?: unknown }).title
    if (typeof t === 'string') titles.set(slug, t)
  }

  // Emits a bare site path; rehypeBasePath in the pipeline prefixes basePath
  // onto every root-relative href/src in the rendered HTML, so this (and any
  // hand-written markdown link or image) does not have to remember to.
  const resolve = (target: string) => {
    const title = titles.get(target)
    if (!title) return null
    return { href: target.startsWith('papers/') ? `/${target}/` : `/notes/${target}/`, title }
  }

  // Pass 2: compile.
  const notes: Note[] = []
  const papers: Paper[] = []
  const allCards: Card[] = []
  const seenCardIds = new Map<string, string>()
  /** term -> slugs using it, for /glossary. */
  const termUsage = new Map<string, string[]>()

  for (const p of parsed) {
    const isPaper = p.subject === 'papers'
    const res = isPaper ? PaperMeta.safeParse(p.data) : NoteMeta.safeParse(p.data)
    if (!res.success) {
      report(`content/${p.rel}`, res.error)
      continue
    }
    const meta = res.data
    if (meta.draft && !IS_DEV) continue

    const r = await render(p.content, { resolve, glossary })

    for (const e of r.cardErrors) problems.push(`  content/${p.rel}\n    ${e}`)
    for (const t of r.unknownTerms) {
      // Fatal, unlike a broken wiki-link: the vocabulary is closed, so this is
      // a typo with nothing sensible to render, not link rot to live with.
      problems.push(
        `  content/${p.rel}\n    :term[${t}] 不在 content/_glossary.yml 里。要么补进术语表，要么改用已有术语。`,
      )
    }
    for (const t of r.terms) {
      const usage = termUsage.get(t) ?? []
      usage.push(p.slug)
      termUsage.set(t, usage)
    }
    for (const b of r.brokenLinks) {
      // Visible, not fatal: a KB you cannot build because you renamed a file is
      // a KB you stop writing in.
      warnings.push(`  content/${p.rel} -> [[${b}]] 找不到目标`)
    }

    const href = isPaper ? `/${p.slug}/` : `/notes/${p.slug}/`

    const cards: Card[] = []
    for (const raw of r.cards) {
      const id = cardId(raw.explicitId, p.slug, raw.questionSource)

      const prior = seenCardIds.get(id)
      if (prior) {
        problems.push(
          `  content/${p.rel}\n    卡片 id "${id}" 与 ${prior} 重复。id 是复习进度的主键，重复会让两张卡共用同一份进度。给其中一张显式指定 ::::card{id=...}`,
        )
        continue
      }
      seenCardIds.set(id, `content/${p.rel}`)

      const [questionHtml, answerHtml] = await Promise.all([
        renderFragment(raw.question),
        renderFragment(raw.answer),
      ])

      cards.push({
        id,
        noteSlug: p.slug,
        noteHref: href,
        anchor: r.headingIds[raw.headingIndex] ?? '',
        noteTitle: meta.title,
        subject: p.subject,
        level: isPaper ? 'advanced' : (meta as z.infer<typeof NoteMeta>).level,
        tags: meta.tags,
        questionHtml,
        answerHtml,
      })
    }
    allCards.push(...cards)

    // The English, abbreviation and aliases of every term used are appended to
    // the search text, so searching "radiance" — or "SVD" — finds the Chinese
    // note that never spells either out. The abbreviation matters most here:
    // it is what people actually type.
    const termEnglish = r.terms
      .flatMap((t) => [glossary[t]?.en, glossary[t]?.abbr, ...(glossary[t]?.aka ?? [])])
      .filter(Boolean)
      .join(' ')

    const base = {
      slug: p.slug,
      href,
      html: r.html,
      text: termEnglish ? `${r.text} ${termEnglish}` : r.text,
      toc: r.toc,
      cards,
      links: r.links,
      terms: r.terms,
    }

    if (isPaper) {
      papers.push({ ...base, meta: meta as z.infer<typeof PaperMeta> })
    } else {
      notes.push({
        ...base,
        subject: p.subject,
        meta: meta as z.infer<typeof NoteMeta>,
        wordCount: countWords(r.text),
      })
    }
  }

  if (problems.length) {
    console.error(`\n✗ 内容校验失败 (${problems.length} 处):\n`)
    console.error(problems.join('\n\n'))
    console.error('')
    process.exit(1)
  }

  // Inverted link map, rendered as 「被引用于」 in the note footer.
  const backlinks: Record<string, string[]> = {}
  for (const n of [...notes, ...papers]) {
    for (const target of n.links) {
      ;(backlinks[target] ??= []).push(n.slug)
    }
  }

  await rm(GENERATED, { recursive: true, force: true })
  await mkdir(join(GENERATED, 'notes'), { recursive: true })
  await mkdir(join(GENERATED, 'papers'), { recursive: true })
  await mkdir(PUBLIC_DATA, { recursive: true })

  for (const n of notes) {
    await writeFile(join(GENERATED, 'notes', `${hashSlug(n.slug)}.json`), JSON.stringify(n))
  }
  for (const p of papers) {
    await writeFile(join(GENERATED, 'papers', `${hashSlug(p.slug)}.json`), JSON.stringify(p))
  }

  const strip = <T extends { html: unknown; text: unknown; cards: unknown; toc: unknown }>(x: T) => {
    const { html: _h, text: _t, cards: _c, toc: _o, ...rest } = x
    return rest
  }
  const noteIndex = notes.map(strip) as NoteIndexEntry[]

  // Only terms actually used reach the site; an unused glossary entry is a
  // draft, not content.
  const terms: Term[] = [...termUsage.entries()]
    .map(([term, usedIn]) => ({ term, ...glossary[term], usedIn: [...new Set(usedIn)] }))
    .sort((a, b) => a.term.localeCompare(b.term, 'zh'))

  await writeFile(join(GENERATED, 'notes-index.json'), JSON.stringify(noteIndex))
  await writeFile(join(GENERATED, 'papers-index.json'), JSON.stringify(papers.map(strip)))
  await writeFile(join(GENERATED, 'subjects.json'), JSON.stringify(subjects))
  await writeFile(join(GENERATED, 'backlinks.json'), JSON.stringify(backlinks))
  await writeFile(join(GENERATED, 'terms.json'), JSON.stringify(terms))

  // Search index. Built here so the client never sees the corpus — it fetches
  // the prebuilt index only when the search UI opens.
  const searchDocs: SearchDoc[] = [
    ...notes.map(
      (n): SearchDoc => ({
        id: n.slug,
        title: n.meta.title,
        subject: n.subject,
        level: n.meta.level,
        tags: n.meta.tags,
        summary: n.meta.summary ?? '',
        text: n.text,
        href: n.href,
        kind: 'note',
      }),
    ),
    ...papers.map(
      (p): SearchDoc => ({
        id: p.slug,
        title: p.meta.title,
        subject: '',
        level: 'advanced',
        tags: [...p.meta.tags, p.meta.venue, String(p.meta.year), ...p.meta.authors],
        summary: p.meta.summary ?? '',
        text: p.text,
        href: p.href,
        kind: 'paper',
      }),
    ),
  ]

  // public/data is browser-fetched at runtime. Never import these from a client
  // component: Next inlines imported JSON, so the bundle would grow with the KB.
  await writeFile(join(PUBLIC_DATA, 'cards.json'), JSON.stringify(allCards))
  await writeFile(join(PUBLIC_DATA, 'notes-index.json'), JSON.stringify(noteIndex))
  await writeFile(join(PUBLIC_DATA, 'search.json'), JSON.stringify(createIndex(searchDocs)))

  if (warnings.length) {
    console.warn(`\n⚠ ${warnings.length} 个失效的 wiki-link (页面会标红，不阻断构建):`)
    console.warn(warnings.join('\n'))
    console.warn('')
  }

  const unused = Object.keys(glossary).filter((t) => !termUsage.has(t))
  if (unused.length) {
    console.warn(`\n⚠ ${unused.length} 个术语在 _glossary.yml 里但没被任何笔记用到:`)
    console.warn(`  ${unused.join('、')}`)
    console.warn('')
  }

  const kb = (JSON.stringify(allCards).length / 1024).toFixed(0)
  console.log(
    `✓ ${notes.length} 篇笔记, ${papers.length} 篇论文, ${allCards.length} 张卡片 (${kb}KB), ${terms.length}/${Object.keys(glossary).length} 个术语, ${Object.keys(subjects).length} 个科目 (${Date.now() - t0}ms)`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
