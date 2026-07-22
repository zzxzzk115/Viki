/**
 * Fetches English dictation clips from VOA Learning English → data/listening/latest.json.
 *
 * Real-world listening: VOA's programs are actual broadcast news/features read
 * by newsreaders at a learner-friendly pace. Each article page carries an mp3
 * (authentic broadcast audio) and the exact transcript, so a short opening
 * excerpt is a faithful dictation clip. VOA content is US-government public
 * domain. Audio plays via <audio> (no CORS needed; hotlink-friendly, no Referer
 * block). Runs in reading.yml, non-fatal: an outage keeps the previous file.
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ListeningFile, type ListeningItem } from '../src/lib/listening-feed'

const ROOT = process.cwd()
const DATA = join(ROOT, 'data', 'listening')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const WANT = 12
const PER_FEED = 3 // passages to keep per program
const SCAN = 12 // articles to try per program before giving up
// The mp3 reads the whole article, so the dictation is the whole transcript —
// this bounds a passage to a sane length (≈2–4 min of audio).
const MIN_WORDS = 40
const MAX_WORDS = 650
const notes: string[] = []

// Curated VOA Learning English programs with authentic audio, weighted toward
// news and features (not the grammar/vocabulary teaching segments). The /api/z…
// paths are VOA's canonical, long-stable RSS endpoints.
const FEEDS: { name: string; url: string }[] = [
  { name: 'As It Is', url: 'https://learningenglish.voanews.com/api/zkm-ql-vomx-tpej-rqi' },
  { name: 'Science & Technology', url: 'https://learningenglish.voanews.com/api/zmg_pl-vomx-tpeymtm' },
  { name: 'Health & Lifestyle', url: 'https://learningenglish.voanews.com/api/zmmpql-vomx-tpey-_q' },
  { name: 'U.S. History', url: 'https://learningenglish.voanews.com/api/zj_pvl-vomx-tpebb_v' },
  { name: 'Arts & Culture', url: 'https://learningenglish.voanews.com/api/zpyp_l-vomx-tpe_rym' },
]

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

/**
 * The article's spoken body, joined into one passage. VOA's mp3 reads the whole
 * article, so the full transcript is what aligns with the audio — the learner
 * hears the whole clip and fills blanks across it. Drops photo captions and the
 * trailing "Words in This Story" glossary, which the audio does not read.
 */
function transcript(html: string): string {
  // Everything before the glossary / quiz / rule-line footer is the read body.
  const body = html.split(/Words in This Story|_{6,}|We want to hear from you/i)[0]
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) =>
      decode(m[1].replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1') // stripped inline tags can leave "gardener ,"
        .trim(),
    )
    .filter(
      (p) =>
        p.length > 40 &&
        /[.!?]["”']?$/.test(p) && // real prose, not a title/byline line
        !/No media source|Embed share|VOA Learning English|^See all|^FILE[\s—-]/i.test(p),
    )
  return paras.join(' ')
}

async function get(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

interface RssItem {
  title: string
  link: string
}

function parseRss(xml: string): RssItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => ({
      title: decode(((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim()),
      link: ((m[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim(),
    }))
    .filter((i) => /\/a\/.*\.html/.test(i.link))
}

/** Extract the broadcast mp3 and the full spoken transcript from an article page. */
function parseArticle(html: string): { audio: string; text: string } | null {
  const audio = (html.match(/https:\/\/voa-audio\.voanews\.eu\/[^"'\s&]+?\.mp3/) || [])[0]
  if (!audio) return null // video-only / photo galleries have no mp3
  const text = transcript(html)
  const words = wordCount(text)
  // Too short = probably a video stub; too long = a slog for one dictation.
  if (words < MIN_WORDS || words > MAX_WORDS) return null
  return { audio, text }
}

async function main() {
  await mkdir(DATA, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const items: ListeningItem[] = []
  const seen = new Set<string>()

  for (const feed of FEEDS) {
    const rss = await get(feed.url)
    if (!rss) {
      notes.push(`${feed.name}: RSS 抓取失败`)
      continue
    }
    const articles = parseRss(rss).slice(0, SCAN)
    let kept = 0
    for (const art of articles) {
      if (kept >= PER_FEED || items.length >= WANT) break
      const html = await get(art.link)
      if (!html) continue
      const parsed = parseArticle(html)
      if (!parsed) continue
      const id = createHash('sha1').update(parsed.audio).digest('hex').slice(0, 10)
      if (seen.has(id)) continue
      seen.add(id)
      items.push({
        id,
        text: parsed.text,
        audio: parsed.audio,
        translation: '',
        title: art.title,
        source: `VOA · ${feed.name}`,
        url: art.link,
      })
      kept++
      await new Promise((r) => setTimeout(r, 400))
    }
    notes.push(`${feed.name}: 收 ${kept} 条（累计 ${items.length}）`)
    if (items.length >= WANT) break
  }

  if (items.length === 0) {
    console.error('✗ VOA 没拿到数据，保留上一次的 latest.json')
    console.error(notes.map((n) => `  ${n}`).join('\n'))
    process.exit(0)
  }

  const file = ListeningFile.parse({ date, items, notes })
  await writeFile(join(DATA, 'latest.json'), JSON.stringify(file, null, 2))
  console.log(`✓ ${date}: 听力 ${items.length} 条（VOA Learning English）`)
  console.log(notes.map((n) => `  · ${n}`).join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
