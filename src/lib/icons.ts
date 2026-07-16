/**
 * Build-time icon resolution: "mdi:function-variant" -> inline <svg> string.
 *
 * Icons are named in _subject.yml, i.e. they are data, not code. A React icon
 * library resolves icons by static import, so data-named icons would force a
 * runtime registry — which either bundles a whole icon set or requires a code
 * edit per new subject, breaking "drop in a file and it works".
 *
 * Resolving here instead means: any icon from any installed set is namable in
 * YAML, only the icons actually used are emitted, and the browser makes no
 * external request. The @iconify-json/* sets are devDependencies — they never
 * reach the bundle.
 */
import { getIconData, iconToHTML, iconToSVG, replaceIDs } from '@iconify/utils'
import type { IconifyJSON } from '@iconify/types'
import { icons as fa6Solid } from '@iconify-json/fa6-solid'
import { icons as lucide } from '@iconify-json/lucide'
import { icons as mdi } from '@iconify-json/mdi'

const SETS: Record<string, IconifyJSON> = {
  'fa6-solid': fa6Solid as IconifyJSON,
  mdi: mdi as IconifyJSON,
  lucide: lucide as IconifyJSON,
}

export const ICON_SETS = Object.keys(SETS)

/** Iconify's own naming: "<prefix>:<name>", e.g. "mdi:function-variant". */
export const ICON_PATTERN = /^[a-z0-9-]+:[a-z0-9-]+$/

export class IconError extends Error {}

export function resolveIcon(spec: string): string {
  const [prefix, name] = spec.split(':')
  const set = SETS[prefix]
  if (!set) {
    throw new IconError(`未知图标集 "${prefix}"，已安装: ${ICON_SETS.join(', ')}`)
  }
  const data = getIconData(set, name)
  if (!data) {
    throw new IconError(`图标集 "${prefix}" 里没有 "${name}"`)
  }
  const render = iconToSVG(data, { height: 'unset', width: 'unset' })
  // replaceIDs keeps internal ids unique once several icons share a document.
  return iconToHTML(replaceIDs(render.body), {
    ...render.attributes,
    fill: 'currentColor',
    'aria-hidden': 'true',
  })
}
