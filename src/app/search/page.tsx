import { SearchUI } from './search-ui'

export const metadata = { title: '搜索' }

export default function SearchPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">搜索</h1>
      <SearchUI />
    </main>
  )
}
