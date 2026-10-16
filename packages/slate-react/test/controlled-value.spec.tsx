import React, { useState } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { createEditor, Descendant, Editor, Transforms } from 'slate'
import { withHistory, HistoryEditor } from 'slate-history'
import {
  EDITOR_TO_PENDING_ACTION,
  EDITOR_TO_PENDING_DIFFS,
  IS_COMPOSING,
} from 'slate-dom'
import { Editable, Slate, withReact } from '../src'

Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
  get() {
    return (
      this.closest('[contenteditable]')?.getAttribute('contenteditable') ===
      'true'
    )
  },
})

const doc = (text: string): Descendant[] => [{ children: [{ text }] }]
const setup = () => {
  const editor = withReact(withHistory(createEditor()))
  editor.children = doc('seed')
  return editor
}
const view = (editor: ReturnType<typeof setup>, value: Descendant[]) => (
  <Slate {...{ editor, value }}>
    <Editable />
  </Slate>
)

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('controlled value', () => {
  it('uses value on mount and synchronizes updates before paint', async () => {
    const editor = setup()
    const { container, rerender } = render(view(editor, doc('first')))
    expect(container.textContent).toContain('first')
    Transforms.select(editor, { path: [0, 0], offset: 2 })
    rerender(view(editor, doc('first extended')))
    expect(container.textContent).toContain('first extended')
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 2 })
    await act(async () => {})
  })

  it('rejects value together with initialValue', () => {
    const editor = setup()
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() =>
        render(
          <Slate
            {...{
              editor,
              value: doc('controlled'),
              initialValue: doc('initial'),
            }}
          >
            <Editable />
          </Slate>
        )
      ).toThrow('value and initialValue')
    } finally {
      spy.mockRestore()
    }
  })

  it('does not echo values emitted by the editor back through applyValue', async () => {
    const editor = setup()
    const apply = jest.fn((editor: Editor, value: Descendant[]) =>
      Transforms.setChildren(editor, value)
    )
    const onValueChange = jest.fn()
    const App = () => {
      const [value, setValue] = useState(doc('a'))
      return (
        <Slate
          {...{ editor, value, applyValue: apply }}
          onValueChange={next => {
            onValueChange(next)
            setValue(next)
          }}
        >
          <Editable />
        </Slate>
      )
    }
    render(<App />)
    apply.mockClear()
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 1 })
      editor.insertText('b')
    })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(apply).not.toHaveBeenCalled()
    expect(Editor.string(editor, [])).toBe('ab')
  })

  it('waits until composition ends and applies only the newest pending value', async () => {
    jest.useFakeTimers()
    const editor = setup()
    const { container, rerender } = render(view(editor, doc('initial')))
    IS_COMPOSING.set(editor, true)
    rerender(view(editor, doc('first update')))
    rerender(view(editor, doc('latest update')))
    expect(container.textContent).toContain('initial')
    await act(async () => {
      await jest.advanceTimersByTimeAsync(40)
    })
    expect(Editor.string(editor, [])).toBe('initial')
    IS_COMPOSING.set(editor, false)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20)
    })
    expect(container.textContent).toContain('latest update')
  })

  for (const pending of ['action', 'diffs'] as const) {
    it(`waits for Android pending ${pending} to flush`, async () => {
      jest.useFakeTimers()
      const editor = setup()
      const { container, rerender } = render(view(editor, doc('initial')))
      if (pending === 'action')
        EDITOR_TO_PENDING_ACTION.set(editor, { run: () => {} })
      else
        EDITOR_TO_PENDING_DIFFS.set(editor, [
          { id: 0, path: [0, 0], diff: { start: 0, end: 0, text: 'x' } },
        ])
      rerender(view(editor, doc('external')))
      expect(Editor.string(editor, [])).toBe('initial')
      EDITOR_TO_PENDING_ACTION.delete(editor)
      EDITOR_TO_PENDING_DIFFS.delete(editor)
      await act(async () => {
        await jest.advanceTimersByTimeAsync(20)
      })
      expect(container.textContent).toContain('external')
    })
  }

  it('normalizes an external value and emits the normalized result once', async () => {
    const editor = setup()
    const onValueChange = jest.fn()
    const { rerender } = render(
      <Slate {...{ editor, value: doc('a') }} onValueChange={onValueChange}>
        <Editable />
      </Slate>
    )
    await act(async () => {})
    onValueChange.mockClear()
    await act(async () => {
      rerender(
        <Slate
          {...{ editor, value: [{ children: [] }] }}
          onValueChange={onValueChange}
        >
          <Editable />
        </Slate>
      )
    })
    expect(editor.children).toEqual([{ children: [{ text: '' }] }])
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith(editor.children)
  })

  it('allows a custom applyValue without adding stream chunks to undo', async () => {
    const editor = setup()
    const applyValue = (_: Editor, value: Descendant[]) =>
      HistoryEditor.withoutSaving(editor, () =>
        Transforms.setChildren(editor, value)
      )
    const { rerender } = render(
      <Slate
        {...{ editor, value: [doc('a')[0], doc('stream')[0]], applyValue }}
      >
        <Editable />
      </Slate>
    )
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 1 })
      editor.insertText('b')
    })
    await act(async () => {
      rerender(
        <Slate
          {...{
            editor,
            value: [editor.children[0], doc('streamed')[0]],
            applyValue,
          }}
        >
          <Editable />
        </Slate>
      )
    })
    expect(editor.history.undos.length).toBe(1)
    await act(async () => {
      editor.undo()
    })
    expect(Editor.string(editor, [])).toBe('astreamed')
  })

  it('cancels a deferred update when unmounted', async () => {
    jest.useFakeTimers()
    const editor = setup()
    const { rerender, unmount } = render(view(editor, doc('initial')))
    IS_COMPOSING.set(editor, true)
    rerender(view(editor, doc('external')))
    unmount()
    IS_COMPOSING.set(editor, false)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(40)
    })
    expect(Editor.string(editor, [])).toBe('initial')
  })
})

it('can restore a previous value object after accepting an editor echo', async () => {
  const editor = setup()
  const original = doc('a')
  const { container, rerender } = render(view(editor, original))
  await act(async () => {
    Transforms.select(editor, { path: [0, 0], offset: 1 })
    editor.insertText('b')
  })
  rerender(view(editor, editor.children))
  rerender(view(editor, original))
  expect(container.textContent).toContain('a')
  expect(Editor.string(editor, [])).toBe('a')
  await act(async () => {})
})

it('holds an external update from compositionstart before any compositionupdate', async () => {
  jest.useFakeTimers()
  const editor = setup()
  const { getByRole, rerender } = render(view(editor, doc('initial')))
  const textbox = getByRole('textbox')
  fireEvent.compositionStart(textbox, { data: '' })
  rerender(view(editor, doc('external')))
  expect(Editor.string(editor, [])).toBe('initial')
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20)
  })
  expect(Editor.string(editor, [])).toBe('initial')
  await act(async () => {
    fireEvent.compositionEnd(textbox, { data: '' })
  })
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20)
  })
  expect(Editor.string(editor, [])).toBe('external')
})
