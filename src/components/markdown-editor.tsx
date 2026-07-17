'use client'

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'

/**
 * CodeMirror 6 markdown editor — the standard TypeScript editor kernel,
 * chosen over WYSIWYG frameworks (Milkdown/MDXEditor) deliberately: this KB's
 * markdown is full of custom directives (::::card, :::quiz, :term[…],
 * wiki-links) that a WYSIWYG would either mangle or need bespoke plugins for.
 * A source editor with syntax highlighting + the existing live preview keeps
 * the file text as the single source of truth.
 *
 * Highlighting uses classHighlighter (semantic .tok-* classes) instead of a
 * baked-in theme, so light/dark colors live in globals.css next to every
 * other theme rule. Fenced code blocks get their languages lazy-loaded via
 * @codemirror/language-data — none of them weigh on the initial bundle.
 */
export interface MarkdownEditorHandle {
  /**
   * Replaces the whole document as ONE undoable transaction — an AI fill is
   * a single Ctrl+Z away from the previous text. The updateListener fires,
   * so onChange/dirty propagate exactly like typing.
   */
  setValue: (text: string) => void
}

export function MarkdownEditor({
  initialValue,
  onChange,
  ref,
}: {
  initialValue: string
  onChange: (value: string) => void
  ref?: Ref<MarkdownEditorHandle>
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Keep the latest onChange without re-creating the editor.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useImperativeHandle(
    ref,
    () => ({
      setValue: (text: string) => {
        const v = view.current
        if (!v) return
        v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } })
      },
    }),
    [],
  )

  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          keymap.of([...markdownShortcuts, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(classHighlighter),
          EditorView.lineWrapping,
          placeholder('开始写 markdown……'),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // initialValue seeds the document once; later parent state changes flow
    // FROM the editor, so re-creating on every keystroke would be a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-300 focus-within:border-neutral-500 dark:border-neutral-700 dark:focus-within:border-neutral-400">
      <div className="flex flex-wrap gap-0.5 border-b border-neutral-200 bg-neutral-50 px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900">
        {TOOLBAR.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.title}
            onClick={() => view.current && t.run(view.current)}
            className="rounded px-2 py-1 font-mono text-xs text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div ref={host} className="md-editor" />
    </div>
  )
}

/** Wraps the selection (or inserts the marker pair at the cursor). */
function wrapSelection(view: EditorView, before: string, after = before): boolean {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  })
  view.focus()
  return true
}

/** Inserts a block snippet on its own lines at the cursor. */
function insertBlock(view: EditorView, snippet: string, cursorOffset: number): boolean {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const prefix = line.length === 0 ? '' : '\n\n'
  view.dispatch({
    changes: { from: line.to, insert: prefix + snippet },
    selection: { anchor: line.to + prefix.length + cursorOffset },
  })
  view.focus()
  return true
}

const CARD_SNIPPET = `::::card
问题？

:::answer
答案。
:::

:::quiz
- ✓ 正确选项
- 干扰项 1
- 干扰项 2
- 干扰项 3
:::
::::`

const TOOLBAR: { label: string; title: string; run: (v: EditorView) => void }[] = [
  { label: 'B', title: '加粗 (Ctrl+B)', run: (v) => wrapSelection(v, '**') },
  { label: 'I', title: '斜体 (Ctrl+I)', run: (v) => wrapSelection(v, '*') },
  { label: '`', title: '行内代码', run: (v) => wrapSelection(v, '`') },
  { label: 'H2', title: '二级标题', run: (v) => insertBlock(v, '## 标题', 3) },
  { label: '[]', title: '链接 (Ctrl+K)', run: (v) => wrapSelection(v, '[', ']()') },
  { label: '[[', title: 'wiki-link', run: (v) => wrapSelection(v, '[[', ']]') },
  { label: ':t', title: '术语标注 :term[…]', run: (v) => wrapSelection(v, ':term[', ']') },
  { label: '$', title: '行内公式', run: (v) => wrapSelection(v, '$') },
  { label: '```', title: '代码块', run: (v) => insertBlock(v, '```\n\n```', 4) },
  { label: '卡', title: '知识卡片（含 quiz）', run: (v) => insertBlock(v, CARD_SNIPPET, 8) },
]

const markdownShortcuts = [
  { key: 'Mod-b', run: (v: EditorView) => wrapSelection(v, '**') },
  { key: 'Mod-i', run: (v: EditorView) => wrapSelection(v, '*') },
  { key: 'Mod-k', run: (v: EditorView) => wrapSelection(v, '[', ']()') },
]
