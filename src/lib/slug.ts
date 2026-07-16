import { createHash } from 'node:crypto'

/**
 * Slugs contain '/', which is not a filename. Hashing keeps .generated/ flat.
 * Lives in its own module because both the build script and the server-only
 * reader need it, and the script cannot import a 'server-only' module.
 */
export function hashSlug(slug: string): string {
  return createHash('sha1').update(slug).digest('hex').slice(0, 16)
}
