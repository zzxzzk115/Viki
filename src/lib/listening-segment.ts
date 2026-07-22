/**
 * Plan short dictation segments over one VOA article. The mp3 reads the whole
 * article at a steady pace, so a word's position in the transcript maps almost
 * linearly to its time in the audio: boundary fraction = words-so-far / total-
 * words. When real pause locations are known (ffmpeg silencedetect), each
 * boundary snaps to the nearest pause so a segment always starts and ends in a
 * gap, never mid-word. The client turns these fractions into seconds with the
 * loaded audio duration and plays just that sub-range. Pure, so it is unit tested.
 */

export interface PlannedSegment {
  /** The sentences of this segment, joined. */
  text: string
  /** Play window as fractions of total duration [0, 1]. */
  startFrac: number
  endFrac: number
}

const wc = (s: string) => s.split(/\s+/).filter(Boolean).length

function nearest(fracs: number[], f: number): number {
  let best = f
  let bestD = Infinity
  for (const p of fracs) {
    const d = Math.abs(p - f)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/**
 * Group sentences into ~`targetWords`-sized segments and give each a play window.
 * `titleWords` accounts for the spoken headline before sentence 1 (it's part of
 * the audio but not the body text). `pauseFracs` are pause-center fractions for
 * snapping; omit them to fall back to raw proportional boundaries.
 */
export function planSegments(
  sentences: string[],
  titleWords: number,
  targetWords = 55,
  pauseFracs?: number[],
): PlannedSegment[] {
  const sents = sentences.map((s) => s.trim()).filter(Boolean)
  if (sents.length === 0) return []
  const words = sents.map(wc)
  const total = titleWords + words.reduce((a, b) => a + b, 0)
  if (total === 0) return []

  // Fraction of the audio elapsed once sentence i has been read.
  const cum: number[] = []
  let running = titleWords
  for (let i = 0; i < sents.length; i++) {
    running += words[i]
    const raw = running / total
    cum.push(pauseFracs && pauseFracs.length ? nearest(pauseFracs, raw) : raw)
  }

  const segs: PlannedSegment[] = []
  let start = 0
  let count = 0
  for (let i = 0; i < sents.length; i++) {
    count += words[i]
    const last = i === sents.length - 1
    if (count >= targetWords || last) {
      segs.push({
        text: sents.slice(start, i + 1).join(' '),
        // Segment 0 starts at 0 so the spoken headline is heard as lead-in.
        startFrac: start === 0 ? 0 : cum[start - 1],
        endFrac: last ? 1 : cum[i],
      })
      start = i + 1
      count = 0
    }
  }
  return segs
}
