import Link from 'next/link'
import { ShaderPlayer } from '@/components/shader-player'
import { getShaders } from '@/lib/content'

export const metadata = { title: 'Shader 画廊' }

/**
 * Live grid of every ::::shader in the corpus. Each tile embeds the same
 * [data-shader] block the note page renders (source in a hidden <pre>, canvas
 * mounted by ShaderPlayer), so the gallery and the notes cannot drift.
 * Off-screen tiles are paused by the player's IntersectionObserver.
 */
export default async function ShadersPage() {
  const shaders = await getShaders()

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Shader 画廊</h1>
      <p className="mt-2 text-neutral-500">
        写在笔记里的 GLSL，在页面上实时运行。点标题看源码和讲解。
      </p>

      {shaders.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          还没有 shader。在 <code>content/shaders/</code> 下用 <code>::::shader</code> 写一个。
        </p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {shaders.map((s, i) => (
            <div key={`${s.slug}-${i}`} className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
              <div className="shader gallery-tile" data-shader data-height="200">
                {/* Hidden source: the player reads pre.textContent; the note page
                    is where the code is meant to be read. */}
                <pre hidden>{s.source}</pre>
              </div>
              <Link href={s.href} className="block px-4 py-3 text-sm font-medium hover:underline">
                {s.title} →
              </Link>
            </div>
          ))}
        </div>
      )}
      <ShaderPlayer />
    </main>
  )
}
