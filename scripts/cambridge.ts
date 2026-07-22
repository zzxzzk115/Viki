/**
 * Cambridge 英语-汉语（简体）scraper, shared by fetch-word (daily word) and
 * enrich-vocab (backfill). Cambridge has no free open API, so this reads the
 * public page: human-curated Chinese definitions, UK+US IPA, real UK/US audio
 * and bilingual examples — one word at a time, personal use.
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

export interface WordData {
  ipa: string
  ipaUs: string
  pos: string
  definition: string
  definitionZh: string
  example: string
  exampleZh: string
  audioUk: string
  audioUs: string
}

export async function fetchCambridge(word: string): Promise<WordData | null> {
  let html: string
  try {
    const r = await fetch(
      `https://dictionary.cambridge.org/zhs/%E8%AF%8D%E5%85%B8/%E8%8B%B1%E8%AF%AD-%E6%B1%89%E8%AF%AD-%E7%AE%80%E4%BD%93/${encodeURIComponent(word)}`,
      { headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(20000) },
    )
    if (!r.ok) return null
    html = await r.text()
  } catch {
    return null
  }

  const strip = (s: string) =>
    s
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?)”’])/g, '$1') // tag-stripping leaves " ," etc.
      .replace(/([(“‘])\s+/g, '$1')
      .trim()
  const definition = strip(html.match(/class="def ddef_d[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '')
  const definitionZh = strip(html.match(/class="trans dtrans dtrans-se[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '')
  if (!definition && !definitionZh) return null

  const ipas = [...html.matchAll(/class="ipa dipa[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1])
  const audioAbs = (rel: string | undefined) => (rel ? `https://dictionary.cambridge.org${rel}` : '')
  const eg = html.match(/class="examp dexamp"[\s\S]*?<\/div>/)?.[0] ?? ''

  return {
    ipa: ipas[0] ?? '',
    ipaUs: ipas[1] ?? '',
    pos: html.match(/class="pos dpos"[^>]*>([^<]+)</)?.[1] ?? '',
    definition,
    definitionZh,
    example: strip(eg.match(/class="eg deg"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
    exampleZh: strip(eg.match(/class="trans dtrans[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
    audioUk: audioAbs(html.match(/"([^"]*\/uk_pron\/[^"]*\.mp3)"/i)?.[1]),
    audioUs: audioAbs(html.match(/"([^"]*\/us_pron\/[^"]*\.mp3)"/i)?.[1]),
  }
}
