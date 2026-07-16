/**
 * Renders an SVG string that scripts/build-content.ts already resolved.
 * The markup comes from @iconify-json/* at build time, never from user input.
 */
export function Icon({ svg, className = 'size-4' }: { svg?: string; className?: string }) {
  if (!svg) return null
  return <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />
}
