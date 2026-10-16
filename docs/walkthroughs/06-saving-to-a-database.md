# Saving to a Database

Now that you've learned the basics of how to add functionality to the Slate editor, you might be wondering how you'd go about saving the content you've been editing, such that you can come back to your app later and have it load.

In this guide, we'll show you how to add logic to save your Slate content to a database for storage and retrieval later.

Let's start with a basic editor:

```jsx
const initialValue = [
  {
    type: 'paragraph',
    children: [{ text: 'A line of text in a paragraph.' }],
  },
]

const App = () => {
  const [editor] = useState(() => withReact(createEditor()))

  return (
    <Slate editor={editor} initialValue={initialValue}>
      <Editable />
    </Slate>
  )
}
```

That will render a basic Slate editor on your page, and when you type things will change. But if you refresh the page, everything will be reverted back to its original value—nothing saves!

What we need to do is save the changes you make somewhere. For this example, we'll just be using [Local Storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage), but it will give you an idea for where you'd need to add your own database hooks.

So, in our `onChange` handler, we need to save the `value` if anything besides the selection was changed:

```jsx
const initialValue = [
  {
    type: 'paragraph',
    children: [{ text: 'A line of text in a paragraph.' }],
  },
]

const App = () => {
  const [editor] = useState(() => withReact(createEditor()))

  return (
    <Slate
      editor={editor}
      initialValue={initialValue}
      onChange={value => {
        const isAstChange = editor.operations.some(
          op => 'set_selection' !== op.type
        )
        if (isAstChange) {
          // Save the value to Local Storage.
          const content = JSON.stringify(value)
          localStorage.setItem('content', content)
        }
      }}
    >
      <Editable />
    </Slate>
  )
}
```

Now whenever you edit the page, if you look in Local Storage, you should see the `content` value changing.

But... if you refresh the page, everything is still reset. Import `useMemo` from React to read the initial value from Local Storage, like so. For TypeScript, use `useMemo<Descendant[]>` to keep the result typed as your document value.

```jsx
const App = () => {
  const [editor] = useState(() => withReact(createEditor()))
  // Update the initial content to be pulled from Local Storage if it exists.
  const initialValue = useMemo(() => {
    const content = localStorage.getItem('content')
    return (
      (content ? JSON.parse(content) : null) || [
        {
          type: 'paragraph',
          children: [{ text: 'A line of text in a paragraph.' }],
        },
      ]
    )
  }, [])

  return (
    <Slate
      editor={editor}
      initialValue={initialValue}
      onChange={value => {
        const isAstChange = editor.operations.some(
          op => 'set_selection' !== op.type
        )
        if (isAstChange) {
          // Save the value to Local Storage.
          const content = JSON.stringify(value)
          localStorage.setItem('content', content)
        }
      }}
    >
      <Editable />
    </Slate>
  )
}
```

Now you should be able to save changes across refreshes!

Success—you've got JSON in your database.

But what if you want something other than JSON? Well, you'd need to serialize your value differently. For example, if you want to save your content as plain text instead of JSON, we can write some logic to serialize and deserialize plain text values:

```jsx
// Import the `Node` helper interface from Slate.
import { Node } from 'slate'

// Define a serializing function that takes a value and returns a string.
const serialize = value => {
  return (
    value
      // Return the string content of each paragraph in the value's children.
      .map(n => Node.string(n))
      // Join them all with line breaks denoting paragraphs.
      .join('\n')
  )
}

// Define a deserializing function that takes a string and returns a value.
const deserialize = string => {
  // Return a value array of children derived by splitting the string.
  return string.split('\n').map(line => {
    return {
      type: 'paragraph',
      children: [{ text: line }],
    }
  })
}

const App = () => {
  const [editor] = useState(() => withReact(createEditor()))
  // Use our deserializing function to read the data from Local Storage.
  const initialValue = useMemo(
    () => deserialize(localStorage.getItem('content') ?? ''),
    []
  )

  return (
    <Slate
      editor={editor}
      initialValue={initialValue}
      onChange={value => {
        const isAstChange = editor.operations.some(
          op => 'set_selection' !== op.type
        )
        if (isAstChange) {
          // Serialize the value and save the string value to Local Storage.
          localStorage.setItem('content', serialize(value))
        }
      }}
    >
      <Editable />
    </Slate>
  )
}
```

That works! Now you're working with plain text.

You can emulate this strategy for any format you like. You can serialize to HTML, to Markdown, or even to your own custom JSON format that is tailored to your use case.

> 🤖 Note that even though you _can_ serialize your content however you like, there are tradeoffs. The serialization process has a cost itself, and certain formats may be harder to work with than others. In general we recommend writing your own format only if your use case has a specific need for it. Otherwise, you're often better leaving the data in the format Slate uses.

## Changes from outside the editor

Use `value` and `onValueChange` when a store, server response or stream owns the document:

```tsx
import React, { useState } from 'react'
import { createEditor, Descendant } from 'slate'
import { Editable, Slate, withReact } from 'slate-react'

const App = () => {
  const [editor] = useState(() => withReact(createEditor()))
  const [value, setValue] = useState<Descendant[]>([
    { type: 'paragraph', children: [{ text: '' }] },
  ])

  return (
    <Slate editor={editor} value={value} onValueChange={setValue}>
      <Editable />
    </Slate>
  )
}
```

Update `value` to apply external changes. Do not pass `initialValue` together with `value`. Slate diffs the document with operations, so the selection moves with changes and `withHistory` records each external update as its own undo step. Passing back the exact object from `onValueChange` does not reapply it.

Keep unchanged node objects in your updates, for example `setValue(current => [current[0], updatedBlock])`. Shared nodes moved between parents retain their selections. A rebuilt, deep-equal clone emits no operations but costs a content comparison. Accept normalized values emitted by `onValueChange`.

For imperative updates, use `Transforms.setChildren(editor, nextValue)`. To clear the editor, provide a schema-valid empty block such as `[{ type: 'paragraph', children: [{ text: '' }] }]`. Direct assignment to `editor.children` bypasses selection mapping and history.

Use `applyValue` to supply another policy, such as `HistoryEditor.withoutSaving` for a stream into a separate block. Unsaved updates do not rebase older history: changing paths or offsets used by existing undo entries requires your own history policy. External updates wait while composition or pending Android input is active; this is not a conflict-resolution protocol for edits to the same content.

See the [controlled value API](../libraries/slate-react/slate.md#propsvalue-descendant) and the [Controlled value example](https://www.slatejs.org/examples/controlled-value).
