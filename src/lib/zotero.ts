/**
 * Zotero Web API client for the /import page. api.zotero.org sends CORS
 * headers AND exports BibTeX natively (?format=bibtex) — which is why this
 * is a page in the site instead of a Zotero plugin: zero conversion code,
 * works from any device, nothing to install.
 */

export interface ZoteroConfig {
  v: 1
  userId: string
  apiKey: string
  /** Testability seam only (mock server); not exposed in the UI. */
  apiBase?: string
}

export const ZOTERO_KEY = 'viki:zotero:v1'

export function readZoteroConfig(): ZoteroConfig | null {
  try {
    const d = JSON.parse(localStorage.getItem(ZOTERO_KEY) ?? 'null') as Partial<ZoteroConfig> | null
    if (d?.v !== 1 || !d.userId || !d.apiKey) return null
    return d as ZoteroConfig
  } catch {
    return null
  }
}

export function saveZoteroConfig(cfg: ZoteroConfig | null): void {
  try {
    if (cfg) localStorage.setItem(ZOTERO_KEY, JSON.stringify(cfg))
    else localStorage.removeItem(ZOTERO_KEY)
  } catch {}
  window.dispatchEvent(new StorageEvent('storage', { key: ZOTERO_KEY }))
}

export interface ZoteroCollection {
  key: string
  name: string
  numItems: number
}

export interface ZoteroItemRow {
  key: string
  title: string
  creators: string
  year: string
  /** Normalized lowercase DOI, '' when the item has none we can derive. */
  doi: string
}

/**
 * Maps a raw Zotero item to a display row; null for notes/attachments.
 * DOI comes from data.DOI, with an arXiv fallback (url or extra field) so
 * arXiv items dedup against entries the 加入待读 button created.
 */
export function zoteroItemRow(raw: unknown): ZoteroItemRow | null {
  const r = raw as {
    key?: string
    data?: {
      itemType?: string
      title?: string
      DOI?: string
      url?: string
      extra?: string
      date?: string
      creators?: { lastName?: string; name?: string }[]
    }
  }
  const d = r?.data
  if (!r?.key || !d?.itemType || d.itemType === 'note' || d.itemType === 'attachment') return null

  let doi = (d.DOI ?? '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
  if (!doi) {
    const arxiv =
      d.url?.match(/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})/i)?.[1] ??
      d.extra?.match(/arXiv:\s*(\d{4}\.\d{4,5})/i)?.[1]
    if (arxiv) doi = `10.48550/arxiv.${arxiv}`
  }

  const creators = (d.creators ?? [])
    .map((c) => c.lastName ?? c.name ?? '')
    .filter(Boolean)
    .slice(0, 3)
    .join(', ')

  return {
    key: r.key,
    title: d.title ?? '(无标题)',
    creators,
    year: d.date?.match(/\d{4}/)?.[0] ?? '',
    doi,
  }
}

const DEFAULT_BASE = 'https://api.zotero.org'

function headers(cfg: ZoteroConfig): HeadersInit {
  return {
    'Zotero-API-Version': '3',
    Authorization: `Bearer ${cfg.apiKey}`,
  }
}

function mapError(status: number): string {
  if (status === 403) return 'API key 无效或没有该库的读取权限（403）'
  if (status === 404) return 'userID 不存在——注意是数字 ID，不是用户名（在 zotero.org/settings/keys 页面顶部）'
  return `Zotero HTTP ${status}`
}

export type ZoteroResult<T> = { ok: true; data: T; hasMore?: boolean } | { ok: false; message: string }

export async function zFetchCollections(cfg: ZoteroConfig, limit = 100): Promise<ZoteroResult<ZoteroCollection[]>> {
  const base = cfg.apiBase ?? DEFAULT_BASE
  try {
    const r = await fetch(`${base}/users/${cfg.userId}/collections?limit=${limit}`, { headers: headers(cfg) })
    if (!r.ok) return { ok: false, message: mapError(r.status) }
    const j = (await r.json()) as { key: string; data?: { name?: string }; meta?: { numItems?: number } }[]
    return {
      ok: true,
      data: j.map((c) => ({ key: c.key, name: c.data?.name ?? c.key, numItems: c.meta?.numItems ?? 0 })),
    }
  } catch {
    return { ok: false, message: '连不上 api.zotero.org——网络问题，稍后重试' }
  }
}

export async function zFetchItems(cfg: ZoteroConfig, collectionKey: string): Promise<ZoteroResult<ZoteroItemRow[]>> {
  const base = cfg.apiBase ?? DEFAULT_BASE
  try {
    const r = await fetch(
      `${base}/users/${cfg.userId}/collections/${collectionKey}/items/top?format=json&limit=100&sort=dateAdded&direction=desc`,
      { headers: headers(cfg) },
    )
    if (!r.ok) return { ok: false, message: mapError(r.status) }
    const j = (await r.json()) as unknown[]
    const rows = j.map(zoteroItemRow).filter((x): x is ZoteroItemRow => x !== null)
    const hasMore = /rel="next"/.test(r.headers.get('Link') ?? '')
    return { ok: true, data: rows, hasMore }
  } catch {
    return { ok: false, message: '连不上 api.zotero.org——网络问题，稍后重试' }
  }
}

/** Zotero's own BibTeX export, chunked (the itemKey list has a length cap). */
export async function zFetchBibtex(cfg: ZoteroConfig, itemKeys: string[]): Promise<ZoteroResult<string>> {
  const base = cfg.apiBase ?? DEFAULT_BASE
  const parts: string[] = []
  try {
    for (let i = 0; i < itemKeys.length; i += 50) {
      const keys = itemKeys.slice(i, i + 50).join(',')
      const r = await fetch(`${base}/users/${cfg.userId}/items?itemKey=${keys}&format=bibtex`, {
        headers: headers(cfg),
      })
      // Any failing chunk aborts the whole import — half an import that the
      // caller then commits would be a silent data loss.
      if (!r.ok) return { ok: false, message: mapError(r.status) }
      parts.push(await r.text())
    }
    return { ok: true, data: parts.join('\n\n') }
  } catch {
    return { ok: false, message: '连不上 api.zotero.org——网络问题，稍后重试' }
  }
}
