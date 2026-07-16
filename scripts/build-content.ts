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
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import fg from 'fast-glob'
import matter from 'gray-matter'
import { z } from 'zod'
import { resolveIcon } from '../src/lib/icons'
import { countWords, render } from '../src/lib/pipeline'
import { hashSlug } from '../src/lib/slug'
import {
  NoteMeta,
  PaperMeta,
  SubjectMeta,
  type Note,
  type NoteIndexEntry,
  type Paper,
  type Subject,
} from '../src/lib/schema'

const ROOT = process.cwd()
const CONTENT = join(ROOT, 'content')
const GENERATED = join(ROOT, '.generated')
const PUBLIC_DATA = join(ROOT, 'public', 'data')

const IS_DEV = process.env.NODE_ENV !== 'production' && process.env.CI !== 'true'

/** Collected then reported together: fixing frontmatter one build at a time is miserable. */
const problems: string[] = []

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
  const subject = slug.split('/')[0]
  return { rel, slug, subject }
}

async function loadSubjects() {
  const files = await fg('*/_subject.yml', { cwd: CONTENT, absolute: true })
  const subjects: Record<string, Subject> = {}
  for (const f of files) {
    const dir = relative(CONTENT, dirname(f)).split(sep).join('/')
    const file = `content/${dir}/_subject.yml`
    // gray-matter needs frontmatter delimiters; a bare .yml has none.
    const raw = await readFile(f, 'utf8')
    const parsed = matter(`---\n${raw}\n---\n`)
    const res = SubjectMeta.safeParse(parsed.data)
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

async function main() {
  const t0 = Date.now()

  const paths = await fg('**/*.{md,mdx}', { cwd: CONTENT, absolute: true, ignore: ['**/_*'] })
  const subjects = await loadSubjects()

  const notes: Note[] = []
  const papers: Paper[] = []

  for (const abs of paths) {
    const { rel, slug, subject } = identify(abs)
    const raw = await readFile(abs, 'utf8')
    const { data, content } = matter(raw)

    if (subject === 'papers') {
      const res = PaperMeta.safeParse(data)
      if (!res.success) {
        report(`content/${rel}`, res.error)
        continue
      }
      if (res.data.draft && !IS_DEV) continue
      const r = await render(content)
      papers.push({
        slug,
        href: `/${slug}/`,
        meta: res.data,
        html: r.html,
        text: r.text,
        toc: r.toc,
        cards: [],
        links: [],
      })
      continue
    }

    const res = NoteMeta.safeParse(data)
    if (!res.success) {
      report(`content/${rel}`, res.error)
      continue
    }
    if (res.data.draft && !IS_DEV) continue

    const r = await render(content)
    notes.push({
      slug,
      href: `/notes/${slug}/`,
      subject,
      meta: res.data,
      html: r.html,
      text: r.text,
      toc: r.toc,
      cards: [],
      links: [],
      wordCount: countWords(r.text),
    })
  }

  if (problems.length) {
    console.error(`\n✗ frontmatter 校验失败 (${problems.length} 处):\n`)
    console.error(problems.join('\n\n'))
    console.error('')
    process.exit(1)
  }

  // Emit. .generated/ holds bodies (read by RSC at build time); public/data/
  // holds body-less indexes (fetched by the browser at runtime).
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

  const index: NoteIndexEntry[] = notes.map(({ html: _h, text: _t, cards: _c, toc: _o, ...rest }) => rest)
  await writeFile(join(GENERATED, 'notes-index.json'), JSON.stringify(index))
  await writeFile(
    join(GENERATED, 'papers-index.json'),
    JSON.stringify(papers.map(({ html: _h, text: _t, cards: _c, toc: _o, ...rest }) => rest)),
  )
  await writeFile(join(GENERATED, 'subjects.json'), JSON.stringify(subjects))
  await writeFile(join(PUBLIC_DATA, 'notes-index.json'), JSON.stringify(index))

  const ms = Date.now() - t0
  console.log(
    `✓ ${notes.length} 篇笔记, ${papers.length} 篇论文, ${Object.keys(subjects).length} 个科目 (${ms}ms)`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
