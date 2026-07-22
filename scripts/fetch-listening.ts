/**
 * Fetches English dictation clips from VOA Learning English → data/listening/latest.json.
 *
 * Real-world listening: VOA's programs are actual broadcast news/features read
 * by newsreaders. Each article page carries an mp3 (authentic broadcast audio)
 * and the exact transcript. VOA reads the whole article at a steady pace, so we
 * cut each article into short, sentence-grouped SEGMENTS and give each a play
 * window (fractions of the mp3): a word's position in the transcript maps almost
 * linearly to its time in the audio, and — when ffmpeg is available — each
 * boundary snaps to a real pause so a segment starts/ends in a gap, never
 * mid-word. The client plays just that sub-range (with a speed control), so a
 * clip is a short real newscast, not a four-minute passage.
 *
 * VOA content is US-government public domain. Audio plays via <audio> (no CORS
 * needed; hotlink-friendly). Runs in reading.yml, non-fatal: an outage keeps the
 * previous file. ffmpeg is optional — without it, boundaries are proportional.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ListeningFile, type ListeningItem } from '../src/lib/listening-feed'
import { planSegments } from '../src/lib/listening-segment'

const run = promisify(execFile)
const ROOT = process.cwd()
const DATA = join(ROOT, 'data', 'listening')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const WANT_ARTICLES = 10
const PER_FEED = 2
const SCAN = 12 // articles to try per program before giving up
const MIN_WORDS = 60 // shorter = probably a video stub
const MAX_WORDS = 900 // longer articles just make more segments; cap the slog
const TARGET_WORDS = 55 // words per dictation segment
const MAX_SEGS_PER_ARTICLE = 8
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

/** Split a paragraph into sentences (handles trailing quotes/curly quotes). */
function splitSentences(p: string): string[] {
  return p
    .split(/(?<=[.!?][”"']?)\s+(?=[“"'A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The article's spoken body as an ordered list of sentences. Drops photo captions
 * and the trailing "Words in This Story" glossary, which the audio does not read.
 */
function transcriptSentences(html: string): string[] {
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
        /[.!?]["”']?$/.test(p) &&
        !/No media source|Embed share|VOA Learning English|^See all|^FILE[\s—-]/i.test(p),
    )
  return paras.flatMap(splitSentences)
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

/**
 * Download the mp3 and, via ffmpeg, return its duration and the pause-center
 * fractions (0–1) used to snap segment boundaries. Returns null if ffmpeg or the
 * download is unavailable — callers then fall back to proportional boundaries.
 */
async function audioTiming(url: string): Promise<number[] | null> {
  const tmp = join(tmpdir(), `voa-${createHash('sha1').update(url).digest('hex').slice(0, 12)}.mp3`)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
    if (!r.ok) return null
    await writeFile(tmp, Buffer.from(await r.arrayBuffer()))
    // silencedetect prints to stderr; d=0.6 keeps sentence-end pauses, drops most commas.
    const { stderr } = await run('ffmpeg', ['-i', tmp, '-af', 'silencedetect=noise=-30dB:d=0.6', '-f', 'null', '-'], {
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))
    const dur = Number((stderr.match(/Duration: (\d+):(\d+):([\d.]+)/) || []).slice(1).reduce((a, v, i) => a + Number(v) * [3600, 60, 1][i], 0))
    if (!dur) return null
    const centers: number[] = []
    const re = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(stderr))) centers.push(((+m[1] + +m[2]) / 2) / dur)
    return centers
  } catch {
    return null
  } finally {
    await rm(tmp, { force: true }).catch(() => {})
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

function parseArticle(html: string): { audio: string; sentences: string[] } | null {
  const audio = (html.match(/https:\/\/voa-audio\.voanews\.eu\/[^"'\s&]+?\.mp3/) || [])[0]
  if (!audio) return null // video-only / photo galleries have no mp3
  const sentences = transcriptSentences(html)
  const words = sentences.reduce((a, s) => a + wordCount(s), 0)
  if (words < MIN_WORDS || words > MAX_WORDS) return null
  return { audio, sentences }
}

async function main() {
  await mkdir(DATA, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const items: ListeningItem[] = []
  const seenAudio = new Set<string>()
  let articleCount = 0
  let snapped = 0

  for (const feed of FEEDS) {
    const rss = await get(feed.url)
    if (!rss) {
      notes.push(`${feed.name}: RSS 抓取失败`)
      continue
    }
    const articles = parseRss(rss).slice(0, SCAN)
    let kept = 0
    for (const art of articles) {
      if (kept >= PER_FEED || articleCount >= WANT_ARTICLES) break
      const html = await get(art.link)
      if (!html) continue
      const parsed = parseArticle(html)
      if (!parsed) continue
      const audioId = createHash('sha1').update(parsed.audio).digest('hex').slice(0, 10)
      if (seenAudio.has(audioId)) continue
      seenAudio.add(audioId)

      const pauseFracs = await audioTiming(parsed.audio)
      if (pauseFracs && pauseFracs.length) snapped++
      const titleWords = wordCount(art.title)
      const segs = planSegments(parsed.sentences, titleWords, TARGET_WORDS, pauseFracs ?? undefined).slice(
        0,
        MAX_SEGS_PER_ARTICLE,
      )
      // If we capped, the last kept segment should run to the end of its audio span
      // (don't imply the article ends mid-way).
      segs.forEach((seg, i) => {
        items.push({
          id: `${audioId}-${i}`,
          text: seg.text,
          audio: parsed.audio,
          startFrac: seg.startFrac,
          endFrac: seg.endFrac,
          translation: '',
          title: art.title,
          source: `VOA · ${feed.name}`,
          url: art.link,
        })
      })
      kept++
      articleCount++
      notes.push(`${art.title.slice(0, 40)}: ${segs.length} 段${pauseFracs?.length ? '（已对齐停顿）' : '（比例估时）'}`)
      await new Promise((r) => setTimeout(r, 400))
    }
    if (articleCount >= WANT_ARTICLES) break
  }

  if (items.length === 0) {
    console.error('✗ VOA 没拿到数据，保留上一次的 latest.json')
    console.error(notes.map((n) => `  ${n}`).join('\n'))
    process.exit(0)
  }

  const file = ListeningFile.parse({ date, items, notes })
  await writeFile(join(DATA, 'latest.json'), JSON.stringify(file, null, 2))
  console.log(`✓ ${date}: 听力 ${items.length} 段 / ${articleCount} 篇（VOA，${snapped} 篇已按停顿对齐）`)
  console.log(notes.map((n) => `  · ${n}`).join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
