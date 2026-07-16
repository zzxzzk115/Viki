const REPO = 'https://github.com/zzxzzk115/Viki'
const BRANCH = 'master'

/**
 * "Edit on GitHub" link. Visible to everyone — GitHub controls the permission:
 * the owner edits and commits directly, a visitor is routed to fork + PR and
 * cannot touch the repo. The /edit/ URL opens the file in the editor straight
 * away for whoever has write access.
 */
export function EditOnGitHub({ path }: { path: string }) {
  return (
    <a
      href={`${REPO}/edit/${BRANCH}/${path}`}
      className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
    >
      <svg viewBox="0 0 16 16" className="size-3.5 fill-current" aria-hidden="true">
        <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064l6.286-6.286Z" />
      </svg>
      在 GitHub 编辑
    </a>
  )
}
