import { getNoteIndex, getSubjects } from '@/lib/content'
import { NotesBrowser } from './notes-browser'

export const metadata = { title: '笔记' }

export default async function NotesPage() {
  const [notes, subjects] = await Promise.all([getNoteIndex(), getSubjects()])

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">笔记</h1>
      <p className="mt-2 text-neutral-500">按科目、程度、标签筛选。</p>
      <NotesBrowser notes={notes} subjects={subjects} />
    </main>
  )
}
