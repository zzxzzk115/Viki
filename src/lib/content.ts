/**
 * Server-only reader for what scripts/build-content.ts emitted.
 *
 * Under `output: 'export'` every RSC runs during `next build`, so reading JSON
 * off disk here is a build-time cost, not a request-time one. Nothing in this
 * module may be imported from a 'use client' file — it would drag node:fs and
 * the whole content corpus into the browser bundle.
 */
import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
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

/** Display name for a subject dir, falling back to the dir name itself. */
export function subjectName(subjects: Record<string, Subject>, dir: string): string {
  return subjects[dir]?.name ?? dir
}
