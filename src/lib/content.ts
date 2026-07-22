/**
 * Server-only reader for what scripts/build-content.ts emitted.
 *
 * Under `output: 'export'` every RSC runs during `next build`, so reading JSON
 * off disk here is a build-time cost, not a request-time one. Nothing in this
 * module may be imported from a 'use client' file — it would drag node:fs and
 * the whole content corpus into the browser bundle.
 */
import 'server-only'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ListeningFile } from './listening-feed'
import type { FeedFile } from './papers-feed'
import type { ReadingFile } from './reading-feed'
import type { VideoFile } from './video-feed'
import type { Note, NoteIndexEntry, Paper, Subject, Term } from './schema'
import { hashSlug } from './slug'

const GENERATED = join(process.cwd(), '.generated')

export { hashSlug }

async function readJson<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(join(GENERATED, ...segments), 'utf8')) as T
}

export async function getNoteIndex(): Promise<NoteIndexEntry[]> {
  return readJson<NoteIndexEntry[]>('notes-index.json')
}

export async function getNote(slug: string): Promise<Note> {
  return readJson<Note>('notes', `${hashSlug(slug)}.json`)
}

export async function getPaperIndex(): Promise<Omit<Paper, 'html' | 'text' | 'cards' | 'toc'>[]> {
  return readJson('papers-index.json')
}

export async function getPaper(slug: string): Promise<Paper> {
  return readJson<Paper>('papers', `${hashSlug(slug)}.json`)
}

export async function getSubjects(): Promise<Record<string, Subject>> {
  return readJson('subjects.json')
}

/** slug -> slugs of notes linking to it. Inverted from each note's `links`. */
export async function getBacklinks(): Promise<Record<string, string[]>> {
  return readJson('backlinks.json')
}

/** Glossary terms actually used by some document, sorted by the Chinese term. */
export async function getTerms(): Promise<Term[]> {
  return readJson('terms.json')
}

export interface ShaderEntry {
  source: string
  height: number
  slug: string
  title: string
  href: string
}

/** Every ::::shader across the corpus, for the /shaders gallery. */
export async function getShaders(): Promise<ShaderEntry[]> {
  return readJson('shaders.json')
}

// ---- Paper feed (data/papers/, committed by the cron workflow) ----

const FEED = join(process.cwd(), 'data', 'papers')

/**
 * Read at build time via fs, never fetched by the browser: no CORS, and a page
 * view does not depend on arXiv being up. Returns null before the first fetch
 * has ever run.
 */
export async function getFeed(): Promise<FeedFile | null> {
  return readFile(join(FEED, 'latest.json'), 'utf8')
    .then((t) => JSON.parse(t) as FeedFile)
    .catch(() => null)
}

export async function getFeedDates(): Promise<string[]> {
  return readdir(join(FEED, 'history'))
    .then((fs) => fs.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort().reverse())
    .catch(() => [])
}

export async function getFeedByDate(date: string): Promise<FeedFile | null> {
  return readFile(join(FEED, 'history', `${date}.json`), 'utf8')
    .then((t) => JSON.parse(t) as FeedFile)
    .catch(() => null)
}

/** Recommended-reading feed, same build-time-read pattern as getFeed. */
export async function getReading(): Promise<ReadingFile | null> {
  return readFile(join(process.cwd(), 'data', 'reading', 'latest.json'), 'utf8')
    .then((t) => JSON.parse(t) as ReadingFile)
    .catch(() => null)
}

/** Video discovery feed, same pattern. */
export async function getVideos(): Promise<VideoFile | null> {
  return readFile(join(process.cwd(), 'data', 'videos', 'latest.json'), 'utf8')
    .then((t) => JSON.parse(t) as VideoFile)
    .catch(() => null)
}

/** Listening dictation clips, same pattern. */
export async function getListening(): Promise<ListeningFile | null> {
  return readFile(join(process.cwd(), 'data', 'listening', 'latest.json'), 'utf8')
    .then((t) => JSON.parse(t) as ListeningFile)
    .catch(() => null)
}

/** Display name for a subject dir, falling back to the dir name itself. */
export function subjectName(subjects: Record<string, Subject>, dir: string): string {
  return subjects[dir]?.name ?? dir
}
