/**
 * GitHub contents-API client for the online editor.
 *
 * Auth model: a fine-grained PAT (contents: read/write, this repo only) pasted
 * once by the owner and kept in localStorage — a static site has no backend to
 * hold a secret, and GitHub enforces the actual permission: without a valid
 * token the PUT is 401/404 and nothing changes. A PAT push triggers deploy.yml
 * normally (the "GITHUB_TOKEN pushes don't trigger workflows" rule only bites
 * bot commits).
 *
 * Kept fetch-only and environment-free so a Node script can exercise the exact
 * same encode/sha/commit logic against the real API (see the self-test).
 */

export const REPO_OWNER = 'zzxzzk115'
export const REPO_NAME = 'Viki'
export const REPO_BRANCH = 'master'
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`

const API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`

export const TOKEN_KEY = 'viki:gh-token'

/** btoa chokes on code points > 0xFF, i.e. on any Chinese text — encode the
 *  UTF-8 bytes, not the UTF-16 string. */
export function b64EncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  // Chunked: String.fromCharCode(...bytes) overflows the arg limit on big files.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export function b64DecodeUtf8(b64: string): string {
  // The contents API wraps base64 with newlines.
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function headers(token?: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export type LoadResult =
  | { ok: true; text: string; sha: string }
  | { ok: true; text: ''; sha: null; isNew: true }
  | { ok: false; status: number; message: string }

/**
 * Reads a file (+ its sha, required for the commit). Works unauthenticated on a
 * public repo (60 req/h is plenty for an editor); the token lifts the limit.
 * 404 is "new file" mode, not an error — saving then creates it.
 */
export async function ghLoadFile(path: string, token?: string, branch = REPO_BRANCH): Promise<LoadResult> {
  const r = await fetch(`${API}/${encodePath(path)}?ref=${branch}`, { headers: headers(token) })
  if (r.status === 404) return { ok: true, text: '', sha: null, isNew: true }
  if (!r.ok) return { ok: false, status: r.status, message: await errMessage(r) }
  const j = (await r.json()) as { content?: string; sha: string }
  return { ok: true, text: b64DecodeUtf8(j.content ?? ''), sha: j.sha }
}

export interface CommitResult {
  ok: boolean
  status: number
  message: string
  /** Web URL of the commit, when ok. */
  commitUrl?: string
}

/** Creates (sha null) or updates (sha set) the file in one commit. */
export async function ghCommitFile(
  path: string,
  text: string,
  sha: string | null,
  message: string,
  token: string,
  branch = REPO_BRANCH,
): Promise<CommitResult> {
  const r = await fetch(`${API}/${encodePath(path)}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: b64EncodeUtf8(text),
      branch,
      ...(sha ? { sha } : {}),
    }),
  })
  if (!r.ok) return { ok: false, status: r.status, message: await errMessage(r) }
  const j = (await r.json()) as { commit?: { html_url?: string } }
  return { ok: true, status: r.status, message: 'ok', commitUrl: j.commit?.html_url }
}

/** Used only by the self-test to clean up after itself. */
export async function ghDeleteFile(
  path: string,
  sha: string,
  message: string,
  token: string,
  branch = REPO_BRANCH,
): Promise<CommitResult> {
  const r = await fetch(`${API}/${encodePath(path)}`, {
    method: 'DELETE',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch }),
  })
  if (!r.ok) return { ok: false, status: r.status, message: await errMessage(r) }
  return { ok: true, status: r.status, message: 'ok' }
}

/** Segment-wise: slashes must survive, CJK filenames must not. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function errMessage(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { message?: string }
    return j.message ?? `HTTP ${r.status}`
  } catch {
    return `HTTP ${r.status}`
  }
}
