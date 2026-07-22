import { z } from 'zod'

export const LEVELS = ['basic', 'intermediate', 'advanced'] as const
export const Level = z.enum(LEVELS)
export type Level = z.infer<typeof Level>

export const LEVEL_LABEL: Record<Level, string> = {
  basic: '基础',
  intermediate: '进阶',
  advanced: '高阶',
}

/** Frontmatter of content/<subject>/**\/*.md — everything else is derived. */
export const NoteMeta = z.object({
  title: z.string().min(1),
  level: Level.default('basic'),
  tags: z.array(z.string()).default([]),
  summary: z.string().optional(),
  created: z.coerce.date().optional(),
  updated: z.coerce.date().optional(),
  draft: z.boolean().default(false),
})
export type NoteMeta = z.infer<typeof NoteMeta>

/** Frontmatter of content/papers/*.md. */
export const VENUE_TYPES = ['journal', 'conference', 'preprint', 'report', 'talk', 'book', 'course'] as const
export const VenueType = z.enum(VENUE_TYPES)
export type VenueType = z.infer<typeof VenueType>

export const VENUE_TYPE_LABEL: Record<VenueType, string> = {
  journal: '期刊',
  conference: '会议',
  preprint: '预印本',
  report: '报告',
  talk: '演讲',
  book: '书',
  course: '课程',
}

export const PaperMeta = z.object({
  title: z.string().min(1),
  authors: z.array(z.string()).default([]),
  venue: z.string(),
  /** What kind of publication `venue` is — the venue string alone mixes
   *  journals, conferences, GDC talks and arXiv preprints indistinguishably. */
  venueType: VenueType.optional(),
  year: z.number().int().min(1970).max(2100),
  arxiv: z.string().optional(),
  doi: z.string().optional(),
  project: z.url().optional(),
  code: z.url().optional(),
  tags: z.array(z.string()).default([]),
  rating: z.number().int().min(1).max(5).optional(),
  status: z.enum(['to-read', 'reading', 'read']).default('read'),
  summary: z.string().optional(),
  draft: z.boolean().default(false),
})
export type PaperMeta = z.infer<typeof PaperMeta>

/** One entry of content/_glossary.yml, keyed by the Chinese term. */
export const GlossaryEntry = z.object({
  /** Full English term, lowercase unless a proper noun. Not the abbreviation. */
  en: z.string().min(1),
  /**
   * Standard abbreviation, rendered after the full form: 最小可分辨角
   * (minimum angle of resolution, MAR). Distinct from `aka` because the
   * abbreviation is what papers actually use — it belongs on the page, not
   * only in the search index.
   */
  abbr: z.string().optional(),
  def: z.string().optional(),
  /** Alternate Chinese translations. Indexed for search, never rendered. */
  aka: z.array(z.string()).default([]),
  /** Slug of the note that covers this term, if any. */
  see: z.string().optional(),
})
export type GlossaryEntry = z.infer<typeof GlossaryEntry>

export const Glossary = z.record(z.string(), GlossaryEntry)
export type Glossary = z.infer<typeof Glossary>

/** A glossary entry plus its key and where it is used — emitted by the build. */
export interface Term extends GlossaryEntry {
  term: string
  /** Slugs of documents using this term, so /glossary can link to them. */
  usedIn: string[]
}

/** content/<subject>/_subject.yml — optional; falls back to the directory name. */
export const SubjectMeta = z.object({
  name: z.string().min(1),
  /** Iconify name, "<set>:<icon>" e.g. "mdi:function-variant". Resolved to
   *  inline SVG at build time — see src/lib/icons.ts. */
  icon: z
    .string()
    .regex(/^[a-z0-9-]+:[a-z0-9-]+$/, '图标要写成 "<图标集>:<图标名>"，例如 "mdi:function-variant"')
    .optional(),
  order: z.number().default(99),
})
export type SubjectMeta = z.infer<typeof SubjectMeta>

/** SubjectMeta after the build resolved `icon` into an inline <svg> string. */
export interface Subject extends SubjectMeta {
  dir: string
  iconSvg?: string
}

// ---- Derived shapes emitted by scripts/build-content.ts ----

export interface TocEntry {
  depth: number
  text: string
  id: string
}

export interface Card {
  id: string
  noteSlug: string
  /**
   * Route of the source document, resolved at build time. Papers live at
   * /papers/<slug>/ and notes at /notes/<slug>/, so a component cannot derive
   * this from noteSlug without re-deciding the rule and getting papers wrong.
   * basePath is NOT included — this is handed to next/link, which adds it.
   */
  noteHref: string
  /** Heading anchor the card sits under; '' when it precedes any heading. */
  anchor: string
  noteTitle: string
  subject: string
  level: Level
  tags: string[]
  questionHtml: string
  answerHtml: string
  /**
   * Authored multiple-choice options (rendered HTML), from the card's
   * :::quiz block. Absent when the author wrote none — the card is then
   * quizzable only as cloze (if it has blankable keywords) or as a flip card.
   */
  quiz?: { correct: string; distractors: string[] }
}

/**
 * A vocabulary card from a `::::word` block — a SEPARATE track from Card.
 * Its own directive keeps word cards out of cards.json, its own store
 * (viki:vocab:v1) keeps them out of the knowledge-card review pile; the SM-2
 * engine reuses them because it only needs `{ id }`. `meaning`/`example` can
 * be Chinese or English (E-E practice is fine for a language learner).
 */
export interface Word {
  id: string
  word: string
  ipa?: string
  pos?: string
  meaningHtml: string
  exampleHtml?: string
  noteSlug: string
  noteHref: string
  noteTitle: string
}

export interface Note {
  slug: string
  href: string
  subject: string
  meta: NoteMeta
  html: string
  /** Plain text for search; the English of every term used is appended. */
  text: string
  toc: TocEntry[]
  cards: Card[]
  /** Wiki-link targets resolved to slugs. */
  links: string[]
  /** Glossary keys used, in first-use order. */
  terms: string[]
  wordCount: number
  /** Repo-relative source path, e.g. 'content/cs/rendering/brdf.md', for the
   *  "edit on GitHub" link. */
  sourcePath: string
}

export interface Paper {
  slug: string
  href: string
  meta: PaperMeta
  html: string
  text: string
  toc: TocEntry[]
  cards: Card[]
  links: string[]
  terms: string[]
  sourcePath: string
}

/** Body-less note record for list pages and the client-side filter UI. */
export type NoteIndexEntry = Omit<Note, 'html' | 'text' | 'cards' | 'toc'>
