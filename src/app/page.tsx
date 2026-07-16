import { FetchProbe } from './fetch-probe'

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">Viki</h1>
      <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
        个人知识库 · 数学 / 物理 / 计算机 / 图形学
      </p>

      <div className="mt-10 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          P0 部署自检
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="text-emerald-600 dark:text-emerald-400">
            ✓ 你能看到这个带样式的方框 → <code>.nojekyll</code> 生效，
            <code>_next/*</code> 资源没被 Jekyll 吃掉
          </li>
          <li>
            <FetchProbe />
          </li>
        </ul>
      </div>

      <p className="mt-10 text-sm text-neutral-500">P1 起这里会变成「还记得吗？」卡片。</p>
    </main>
  )
}
