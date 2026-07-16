/**
 * Imports scratch/related-work.bib → content/papers/*.md placeholders.
 *
 * Everything is DERIVED from the BibTeX, nothing is hand-mapped per entry — so
 * dropping a new .bib in just works, matching how the rest of the KB behaves.
 *   - title/authors/year/doi: read straight from the entry
 *   - slug: slugified from the title (stop-words dropped, first few words)
 *   - venue: journal/booktitle/howpublished, normalized via a venue dictionary
 *   - tags: keyword dictionary over title+venue (same idea as config/feeds.ts)
 *
 * The body stays a skeleton — 贡献/方法/评价 are the user's to write; a summary
 * of a paper I have not read is fabrication.
 *
 * Idempotent: skips any entry whose DOI or title already exists in the library,
 * so re-running never duplicates a page (and never clobbers one the user filled
 * in). tags are a best-effort guess — edit the generated md when a paper needs a
 * topic the keyword dictionary missed.
 *
 * Non-papers (3D models, scene datasets) are filtered by their `note` field and
 * reported, so a mis-filter is visible rather than silent.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'

const ROOT = process.cwd()
const BIB = join(ROOT, 'scratch', 'related-work.bib')
const OUT = join(ROOT, 'content', 'papers')

// ---- BibTeX parsing ----

interface Entry {
  type: string
  key: string
  fields: Record<string, string>
}

/** Brace-aware parse of `@type{key, field = {value}, ...}`. */
function parseBib(src: string): Entry[] {
  const entries: Entry[] = []
  let i = 0
  while (i < src.length) {
    if (src[i] !== '@') {
      i++
      continue
    }
    const m = /^@(\w+)\s*\{/.exec(src.slice(i))
    if (!m) {
      i++
      continue
    }
    const type = m[1].toLowerCase()
    i += m[0].length
    const comma = src.indexOf(',', i)
    const key = src.slice(i, comma).trim()
    i = comma + 1

    const fields: Record<string, string> = {}
    while (i < src.length) {
      while (i < src.length && /[\s,]/.test(src[i])) i++
      if (src[i] === '}') {
        i++
        break
      }
      const eq = src.indexOf('=', i)
      if (eq === -1) break
      const name = src.slice(i, eq).trim().toLowerCase()
      i = eq + 1
      while (i < src.length && /\s/.test(src[i])) i++

      let value = ''
      if (src[i] === '{') {
        let depth = 0
        do {
          if (src[i] === '{') depth++
          else if (src[i] === '}') depth--
          value += src[i]
          i++
        } while (i < src.length && depth > 0)
        value = value.slice(1, -1)
      } else if (src[i] === '"') {
        i++
        while (i < src.length && src[i] !== '"') value += src[i++]
        i++
      } else {
        while (i < src.length && !/[,}]/.test(src[i])) value += src[i++]
        value = value.trim()
      }
      fields[name] = value
    }
    entries.push({ type, key, fields })
  }
  return entries
}

// ---- LaTeX → Unicode ----

const ACCENTS: Record<string, string> = {
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇',
  v: '̌', c: '̧', u: '̆', H: '̋', k: '̨', r: '̊',
}

function delatex(s: string): string {
  let out = s
    .replace(/\{\\ss\}/g, 'ß')
    .replace(/\\ss(?![a-zA-Z])/g, 'ß')
    .replace(/\{\\o\}/g, 'ø')
    .replace(/\{\\O\}/g, 'Ø')
    .replace(/\{\\ae\}/g, 'æ')
    .replace(/\{\\aa\}/g, 'å')
    .replace(/\{\\l\}/g, 'ł')
  const keys = Object.keys(ACCENTS).map((k) => k.replace(/[.^$*+?()[\]{}|\\]/g, '\\$&')).join('')
  out = out.replace(new RegExp(`\\\\([${keys}])\\s*\\{?([a-zA-Z])\\}?`, 'g'), (_m, a: string, l: string) => l + ACCENTS[a])
  return out.replace(/\\&/g, '&').replace(/[{}]/g, '').normalize('NFC').replace(/\s+/g, ' ').trim()
}

function parseAuthors(raw: string): string[] {
  return raw
    .split(/\s+and\s+/)
    .map((a) => {
      const c = delatex(a)
      const comma = c.indexOf(',')
      if (comma === -1) return c
      return `${c.slice(comma + 1).trim()} ${c.slice(0, comma).trim()}`.trim()
    })
    .filter(Boolean)
}

// ---- derivation: slug / venue / tags ----

// Pure function words only — NOT 'real'/'high'/'system', which carry meaning in
// technical titles ('real-time', 'high-quality') and dropping them mangles slugs.
const STOP = new Set([
  'a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'and', 'or', 'with', 'without',
  'via', 'using', 'based', 'toward', 'towards', 'its', 'into', 'over', 'from', 'by', 'as',
  'is', 'are', 'be', 'this', 'that',
])

/** Title → short kebab slug: drop punctuation + stop-words, keep first 4 content words. */
function slugify(title: string): string {
  return delatex(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w)) // length>1 drops the 's' of "Drake's"
    .slice(0, 4)
    .join('-')
    .replace(/^-+|-+$/g, '')
}

/** Longest-match dictionary of venue name fragments → canonical short form. */
const VENUE_DICT: [RegExp, string][] = [
  [/siggraph asia/i, 'SIGGRAPH Asia'],
  [/interactive 3d graphics|\bi3d\b|si3d/i, 'I3D'],
  [/high performance graphics|\bhpg\b/i, 'HPG'],
  [/graphics hardware/i, 'Graphics Hardware'],
  [/computer vision and pattern recognition|\bcvpr\b/i, 'CVPR'],
  [/vision,? modeling|\bvmv\b/i, 'VMV'],
  [/transactions on visualization and computer graphics|\btvcg\b/i, 'IEEE TVCG'],
  [/transactions on image processing|\btip\b/i, 'IEEE TIP'],
  [/transactions on graphics|\btog\b/i, 'ACM TOG'],
  [/virtual reality software and technology|\bvrst\b/i, 'VRST'],
  [/virtual reality and 3d user interfaces|ieee vr|conference on virtual reality/i, 'IEEE VR'],
  [/computer graphics forum|eurographics/i, 'Eurographics (CGF)'],
  [/game developers conference|\bgdc\b/i, 'GDC'],
  [/journal of computer graphics techniques|\bjcgt\b/i, 'JCGT'],
  [/journal of graphics.*tools|\bjgt\b/i, 'JGT'],
  [/artificial intelligence review/i, 'AI Review'],
  [/attention,? perception/i, 'Attention, Perception & Psychophysics'],
  [/sigchi/i, 'SIGCHI Bulletin'],
  [/siggraph/i, 'SIGGRAPH'],
  // Entries appended by the site's 加入待读 button (howpublished = arXiv preprint …).
  [/arxiv/i, 'arXiv'],
]

/**
 * Publication kind from the BibTeX entry type — parseBib always captured
 * `@article`/`@inproceedings`/…, it was just dropped on the floor before this.
 * misc/unpublished need the venue text to disambiguate (arXiv vs a talk).
 */
export function deriveVenueType(e: Entry, venue: string): string {
  const v = venue.toLowerCase()
  const hp = (e.fields.howpublished ?? '').toLowerCase()
  if (/arxiv/.test(v) || /arxiv/.test(hp)) return 'preprint'
  switch (e.type) {
    case 'article':
      return 'journal'
    case 'inproceedings':
      return 'conference'
    case 'techreport':
      return 'report'
    case 'book':
    case 'incollection':
      return 'book'
    case 'unpublished':
      return 'talk'
    case 'misc':
      if (/symposium|conference|proceedings/.test(hp)) return 'conference'
      if (/course/.test(v) || /course/.test(hp)) return 'course'
      return 'talk'
    default:
      // @inbook etc. — rare; venue text as tiebreaker, else journal-ish default.
      if (/course/.test(v)) return 'course'
      if (/talks|gdc/.test(v)) return 'talk'
      return 'journal'
  }
}

function deriveVenue(e: Entry): string {
  // note last, for grey lit like a GDC talk whose venue lives only there.
  const raw = delatex(
    e.fields.journal || e.fields.booktitle || e.fields.howpublished || e.fields.publisher || e.fields.institution || e.fields.note || '',
  )
  const year = e.fields.year?.trim() ?? ''
  for (const [re, name] of VENUE_DICT) if (re.test(raw)) return `${name} ${year}`.trim()
  // Fallback: first few words of the raw venue, cleaned of proceedings boilerplate.
  const short = raw
    .replace(/^(proceedings of the|proceedings of|the)\s+/i, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .split(/\s+/)
    .slice(0, 4)
    .join(' ')
    .trim()
  return `${short || 'Unknown'} ${year}`.trim()
}

/** Keyword → topic tag, over title + venue. Same layered-keyword idea as feeds.ts. */
const TAG_DICT: [RegExp, string][] = [
  [/inpaint/i, '图像补全'],
  [/warp/i, '图像变形'],
  [/fove/i, '注视点渲染'],
  [/reproject|reprojection/i, '重投影'],
  [/stereo|stereoscopic/i, '立体渲染'],
  [/deferred|clustered|tiled|shading/i, '着色'],
  [/antialiasing|anti-aliasing|supersampl|temporal|\btaa\b|fxaa/i, '时域抗锯齿'],
  [/ambient occlusion|screen[- ]space|\bssr\b|\bhbao\b/i, '屏幕空间'],
  [/splat|point rendering|footprint|qsplat/i, '点渲染'],
  [/lumigraph|light field|view interpolation|view synthesis|image[- ]based/i, '光场/IBR'],
  [/cybersickness|\brsvp\b|perceptual|perception|metameric|psychophys/i, '感知驱动'],
  [/virtual reality|head-mounted|\bhmd\b|gaze|\bvr\b/i, 'VR'],
  [/ray tracing|path tracing/i, '光线追踪'],
]

function deriveTags(title: string, venue: string): string[] {
  const hay = `${delatex(title)} ${venue}`
  const tags = TAG_DICT.filter(([re]) => re.test(hay)).map(([, t]) => t)
  return [...new Set(tags)]
}

/** Datasets and 3D models, identified by their note — reported, not silently dropped. */
function isResource(e: Entry): boolean {
  const note = e.fields.note ?? ''
  return /3d model|sample library|open research content|\borca\b|gltf|cc0/i.test(note)
}

// ---- generate ----

const yamlStr = (s: string) => JSON.stringify(s)
const normTitle = (t: string) => delatex(t).toLowerCase().replace(/[^a-z0-9]+/g, '')

async function existingPapers() {
  const dois = new Set<string>()
  const titles = new Set<string>()
  let files: string[] = []
  try {
    files = (await readdir(OUT)).filter((f) => f.endsWith('.md'))
  } catch {
    return { dois, titles }
  }
  for (const f of files) {
    const { data } = matter(await readFile(join(OUT, f), 'utf8'))
    if (data.doi) dois.add(String(data.doi).toLowerCase().replace(/^https?:\/\/doi\.org\//, ''))
    if (data.title) titles.add(normTitle(String(data.title)))
  }
  return { dois, titles }
}

async function main() {
  // --dry: print the derived slug/venue/tags for every entry without writing or
  // deduping — a preview to sanity-check the rules before importing a new .bib.
  const dry = process.argv.includes('--dry')
  const src = await readFile(BIB, 'utf8')
  const entries = parseBib(src)
  if (!dry) await mkdir(OUT, { recursive: true })
  const existing = dry ? { dois: new Set<string>(), titles: new Set<string>() } : await existingPapers()

  if (dry) {
    for (const e of entries) {
      if (isResource(e)) {
        console.log(`  [资源，跳过] ${e.key}`)
        continue
      }
      const title = delatex(e.fields.title ?? e.key)
      const venue = deriveVenue(e)
      const tags = deriveTags(title, venue)
      console.log(`\n${slugify(title)}`)
      console.log(`  title:  ${title}`)
      console.log(`  venue:  ${venue}`)
      console.log(`  tags:   ${tags.length ? tags.join('、') : '⚠ 无 (关键词词典未命中，需手加)'}`)
    }
    return
  }

  let created = 0
  const skippedResource: string[] = []
  const skippedExisting: string[] = []
  const withoutDoi: string[] = []
  const usedSlugs = new Set<string>()

  for (const e of entries) {
    if (isResource(e)) {
      skippedResource.push(e.key)
      continue
    }
    const title = delatex(e.fields.title ?? e.key)
    const doi = e.fields.doi?.trim().toLowerCase()

    if ((doi && existing.dois.has(doi)) || existing.titles.has(normTitle(title))) {
      skippedExisting.push(e.key)
      continue
    }

    let slug = slugify(title)
    // Guard against two new titles slugging to the same thing in one run.
    while (usedSlugs.has(slug)) slug = `${slug}-${e.fields.year ?? 'x'}`
    usedSlugs.add(slug)

    const authors = parseAuthors(e.fields.author ?? '')
    const year = Number(e.fields.year)
    const url = e.fields.url?.trim()
    const venue = deriveVenue(e)
    const tags = deriveTags(title, venue)
    if (!doi) withoutDoi.push(slug)

    const fm = [
      '---',
      `title: ${yamlStr(title)}`,
      `authors: [${authors.map(yamlStr).join(', ')}]`,
      `venue: ${yamlStr(venue)}`,
      `venueType: ${deriveVenueType(e, venue)}`,
      `year: ${year}`,
    ]
    if (doi) fm.push(`doi: ${yamlStr(e.fields.doi!.trim())}`)
    else if (url) fm.push(`project: ${yamlStr(url)}`) // no generic url on PaperMeta; grey-lit link → project
    fm.push(`tags: [${tags.map(yamlStr).join(', ')}]`)
    fm.push('status: to-read', '---')

    const body = ['', '<!-- 从 BibTeX 导入的占位页。读完后补下面三节，删掉本行。 -->', '', '## 贡献', '', '## 方法', '', '## 我的评价', ''].join('\n')
    await writeFile(join(OUT, `${slug}.md`), fm.join('\n') + '\n' + body, 'utf8')
    created++
  }

  console.log(`✓ 新建 ${created} 篇占位页`)
  if (skippedExisting.length) console.log(`  跳过 ${skippedExisting.length} 篇已在库 (DOI/标题去重)`)
  if (skippedResource.length) console.log(`  跳过 ${skippedResource.length} 个数据集/模型: ${skippedResource.join(', ')}`)
  if (withoutDoi.length) console.log(`  ${withoutDoi.length} 篇无 DOI (灰色文献): ${withoutDoi.join(', ')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
