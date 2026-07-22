'use client'

import { ghCommitFile, ghLoadFile, readStoredToken } from './github-edit'
import { emptyQuizStats, type QuizStats } from './quiz-store'
import { emptyStore, STORE_VERSION, type CardState, type Store } from './srs'

/**
 * Owner-only progress sync, Giscus-shaped but without the app: the same
 * fine-grained PAT the editor uses (contents:write, this repo only) commits
 * review progress to the `data` branch. No OAuth app, no backend, no new
 * secret — GitHub enforces who can write, so visitors without the token
 * simply have no sync (their progress stays in localStorage, as before).
 *
 * On the data branch because progress updates are machine-written state, not
 * content: they would bury real commits on master and a push to `data` does
 * not trigger a site deploy. Note the repo is public, so synced progress
 * (card ids, ease factors, review dates) is public too — review metadata,
 * no note content.
 */

export const SYNC_PATH = 'srs/progress.json'
export const SYNC_BRANCH = 'data'

export interface SyncDoc {
  v: 1
  savedAt: string
  srs: Store
  quiz: QuizStats
  /** Vocabulary review store (viki:vocab:v1). Optional on read for back-compat
   *  with docs written before the vocab track existed. */
  vocab: Store
}

/**
 * Per-card merge: the state whose `last` review is later wins; a same-day tie
 * goes to more reps (more history). Union of card ids, so two devices that
 * each reviewed different cards lose nothing.
 */
export function mergeSrs(local: Store, remote: Store): Store {
  const cards: Record<string, CardState> = { ...remote.cards }
  for (const [id, l] of Object.entries(local.cards)) {
    const r = cards[id]
    cards[id] = !r || l.last > r.last || (l.last === r.last && l.reps >= r.reps) ? l : r
  }
  return { v: STORE_VERSION, cards }
}

/**
 * Quiz stats are monotonic counters without per-event history, so a true
 * cross-device merge is impossible from the aggregates alone — the doc with
 * more answered questions wins wholesale. Good enough for one owner who
 * mostly reviews on one device at a time.
 */
export function mergeQuiz(local: QuizStats, remote: QuizStats): QuizStats {
  return local.total >= remote.total ? local : remote
}

export function parseSyncDoc(text: string): SyncDoc | null {
  try {
    const d = JSON.parse(text) as Partial<SyncDoc>
    if (d?.v !== 1 || !d.srs || d.srs.v !== STORE_VERSION || !d.quiz || d.quiz.v !== 1) return null
    // vocab is newer than the doc format; default it for pre-vocab docs.
    const vocab = d.vocab?.v === STORE_VERSION && d.vocab.cards ? d.vocab : emptyStore()
    return { ...(d as SyncDoc), vocab }
  } catch {
    return null
  }
}

// ---- browser-side agent state ----

export type SyncState =
  | { phase: 'off' } // no token
  | { phase: 'pulling' }
  | { phase: 'pushing' }
  | { phase: 'synced'; at: string }
  | { phase: 'dirty' } // local changes queued, push pending
  | { phase: 'error'; message: string }

const SRS_KEY = 'viki:srs:v1'
const QUIZ_KEY = 'viki:quiz:v1'
const VOCAB_KEY = 'viki:vocab:v1'

let state: SyncState = { phase: 'off' }
const listeners = new Set<() => void>()
let stateJson = JSON.stringify(state)

function setState(next: SyncState) {
  state = next
  stateJson = JSON.stringify(next)
  listeners.forEach((l) => l())
}

export function subscribeSyncState(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
/** Stable string snapshot — same useSyncExternalStore rule as the stores. */
export const getSyncStateSnapshot = () => stateJson
export const getSyncStateServerSnapshot = () => '{"phase":"off"}'

function readLocal(): { srs: Store; quiz: QuizStats; vocab: Store } {
  const read = <T,>(key: string, check: (d: unknown) => boolean, empty: () => T): T => {
    try {
      const d = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
      return check(d) ? (d as T) : empty()
    } catch {
      return empty()
    }
  }
  return {
    srs: read<Store>(SRS_KEY, (d) => (d as Store)?.v === STORE_VERSION && !!(d as Store).cards, emptyStore),
    quiz: read<QuizStats>(QUIZ_KEY, (d) => (d as QuizStats)?.v === 1 && !!(d as QuizStats).streak, emptyQuizStats),
    vocab: read<Store>(VOCAB_KEY, (d) => (d as Store)?.v === STORE_VERSION && !!(d as Store).cards, emptyStore),
  }
}

function writeLocal(srs: Store, quiz: QuizStats, vocab: Store) {
  try {
    localStorage.setItem(SRS_KEY, JSON.stringify(srs))
    localStorage.setItem(QUIZ_KEY, JSON.stringify(quiz))
    localStorage.setItem(VOCAB_KEY, JSON.stringify(vocab))
  } catch {}
  // Same-tab stores listen on 'storage' via their subscribe(); other tabs get
  // the real event. StorageEvent is constructible everywhere we run.
  window.dispatchEvent(new StorageEvent('storage', { key: SRS_KEY }))
  window.dispatchEvent(new StorageEvent('storage', { key: VOCAB_KEY }))
}

let sha: string | null = null
let pulled = false // guard: never push before a successful pull (or 404)
let dirty = false // local changes not yet pushed
let pushTimer: ReturnType<typeof setTimeout> | undefined
let suppress = 0 // our own writeLocal must not schedule a push-back

export function getToken(): string | null {
  return readStoredToken() || null
}

/**
 * Pull remote, merge into local, write back. Safe to call repeatedly.
 * The try/catch matters: GitHub's intermittent 503 error pages carry no CORS
 * headers, so the browser THROWS instead of returning a response — without
 * the guard the state machine would hang on 'pulling' forever.
 */
export async function pullAndMerge(): Promise<void> {
  const token = getToken()
  if (!token) {
    setState({ phase: 'off' })
    return
  }
  setState({ phase: 'pulling' })
  let r: Awaited<ReturnType<typeof ghLoadFile>>
  try {
    r = await ghLoadFile(SYNC_PATH, token, SYNC_BRANCH)
  } catch {
    setState({ phase: 'error', message: '拉取失败：连不上 GitHub API（网络或其临时故障），稍后重试' })
    return
  }
  if (!r.ok) {
    setState({ phase: 'error', message: `拉取失败：${r.message}` })
    return
  }
  sha = r.sha
  pulled = true
  const local = readLocal()
  const remote = 'isNew' in r ? null : parseSyncDoc(r.text)
  if (remote) {
    const srs = mergeSrs(local.srs, remote.srs)
    const quiz = mergeQuiz(local.quiz, remote.quiz)
    const vocab = mergeSrs(local.vocab, remote.vocab) // per-card merge reused verbatim
    suppress++
    try {
      writeLocal(srs, quiz, vocab)
    } finally {
      suppress--
    }
  }
  setState({ phase: 'synced', at: new Date().toISOString() })
}

/** Debounced push; called on every local store change. */
export function schedulePush(delayMs = 10_000): void {
  if (suppress > 0 || !pulled || !getToken()) return
  dirty = true
  setState({ phase: 'dirty' })
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void pushNow(), delayMs)
}

/** Push only when something is queued — a no-change tab close must not commit. */
export function pushIfDirty(): void {
  if (dirty) void pushNow()
}

export async function pushNow(): Promise<void> {
  const token = getToken()
  if (!token || !pulled) return
  dirty = false
  clearTimeout(pushTimer)
  setState({ phase: 'pushing' })
  const local = readLocal()
  const doc: SyncDoc = { v: 1, savedAt: new Date().toISOString(), ...local }
  let r: Awaited<ReturnType<typeof ghCommitFile>>
  try {
    r = await ghCommitFile(SYNC_PATH, JSON.stringify(doc), sha, 'srs: sync progress', token, SYNC_BRANCH)
  } catch {
    // Same no-CORS-on-503 throw as pullAndMerge; keep the change queued.
    dirty = true
    setState({ phase: 'error', message: '推送失败：连不上 GitHub API，稍后自动重试或点「立即推送」' })
    return
  }
  if (r.ok) {
    // The PUT response has the new blob sha, but ghCommitFile doesn't surface
    // it — re-read is one request and also folds in whatever raced us.
    try {
      const reread = await ghLoadFile(SYNC_PATH, token, SYNC_BRANCH)
      if (reread.ok && !('isNew' in reread)) sha = reread.sha
    } catch {
      // Commit landed; a failed sha refresh just means the NEXT push may 409
      // and take the merge-retry path. Not an error worth surfacing.
    }
    setState({ phase: 'synced', at: new Date().toISOString() })
    return
  }
  if (r.status === 409 || r.status === 422) {
    // Another device pushed since our pull: merge theirs in and retry once.
    try {
      await pullAndMerge()
      const merged = readLocal()
      const retry = await ghCommitFile(
        SYNC_PATH,
        JSON.stringify({ v: 1, savedAt: new Date().toISOString(), ...merged } satisfies SyncDoc),
        sha,
        'srs: sync progress (merged)',
        token,
        SYNC_BRANCH,
      )
      if (retry.ok) {
        setState({ phase: 'synced', at: new Date().toISOString() })
        return
      }
      setState({ phase: 'error', message: `推送失败：${retry.message}` })
    } catch {
      dirty = true
      setState({ phase: 'error', message: '推送失败：连不上 GitHub API，稍后自动重试或点「立即推送」' })
    }
    return
  }
  setState({ phase: 'error', message: `推送失败：${r.message}` })
}
