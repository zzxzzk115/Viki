import { getSubjects } from '@/lib/content'
import { CardsSession } from './cards-session'

export const metadata = { title: '复习' }

export default async function CardsPage() {
  const subjects = await getSubjects()

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">复习</h1>
      <p className="mt-2 text-sm text-neutral-500">
        间隔重复（SM-2）。进度默认只存在本机浏览器；配置 GitHub token 后自动同步到仓库、跨设备合并。
      </p>
      <CardsSession subjects={subjects} />
    </main>
  )
}
