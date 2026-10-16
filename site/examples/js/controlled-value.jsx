import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createEditor, Transforms } from 'slate'
import { HistoryEditor, withHistory } from 'slate-history'
import { Editable, Slate, withReact } from 'slate-react'

const chunks = [
  'External ',
  'text ',
  'can ',
  'arrive ',
  'while ',
  'you ',
  'keep ',
  'typing ',
  'in ',
  'another ',
  'block.',
]
const initialValue = [
  { type: 'paragraph', children: [{ text: 'Type here: ' }] },
  {
    type: 'paragraph',
    children: [{ text: 'Stream output will appear here.' }],
  },
]
const ControlledValueExample = () => {
  const editor = useMemo(() => withReact(withHistory(createEditor())), [])
  const [value, setValue] = useState(initialValue)
  const [streaming, setStreaming] = useState(false)
  const [complete, setComplete] = useState(false)
  const timer = useRef(null)
  const applyValue = useCallback(
    (_, next) => {
      HistoryEditor.withoutSaving(editor, () =>
        Transforms.setChildren(editor, next)
      )
    },
    [editor]
  )
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
    },
    []
  )
  const start = () => {
    setStreaming(true)
    setComplete(false)
    let index = 0
    let text = ''
    timer.current = setInterval(() => {
      text += chunks[index++]
      const streamed = text
      setValue(current => [
        current[0],
        { type: 'paragraph', children: [{ text: streamed }] },
      ])
      if (index === chunks.length) {
        clearInterval(timer.current)
        timer.current = null
        setStreaming(false)
        setComplete(true)
      }
    }, 100)
  }
  return (
    <>
      <p>
        Type in the first paragraph while external text streams into the second.
        Undo keeps the streamed text and removes your typing.
      </p>
      <button
        type="button"
        disabled={streaming}
        onMouseDown={event => event.preventDefault()}
        onClick={start}
      >
        Start stream
      </button>
      <output aria-live="polite">
        {streaming ? 'Streaming' : complete ? 'Complete' : 'Ready'}
      </output>
      <Slate
        editor={editor}
        value={value}
        applyValue={applyValue}
        onValueChange={setValue}
      >
        <Editable aria-label="Controlled editor" placeholder="Type here..." />
      </Slate>
    </>
  )
}
export default ControlledValueExample
