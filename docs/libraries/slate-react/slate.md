# Slate Component

## `Slate(props: SlateProps): React.JSX.Element`

The `Slate` component must include somewhere in its `children` the `Editable` component.

### Props

```typescript
type SlateProps = {
  editor: ReactEditor
  initialValue?: Descendant[]
  value?: Descendant[]
  applyValue?: (editor: ReactEditor, value: Descendant[]) => void
  children: React.ReactNode
  onChange?: (value: Descendant[]) => void
  onSelectionChange?: (selection: Selection) => void
  onValueChange?: (value: Descendant[]) => void
}
```

#### `props.editor: ReactEditor`

An instance of `ReactEditor`

#### `props.initialValue?: Descendant[]`

The initial value of the editor. It is loaded into the editor when `Slate` mounts, and again if a different `editor` is passed.

If you leave it out, the editor's existing `editor.children` are used, which suits editors you create and fill ahead of rendering. Leaving it out when `editor.children` is empty throws, since that is usually a forgotten setup step; pass `initialValue={[]}` if an empty editor is intended.

An editor needs at least one block to hold the cursor, so an empty array is loaded as one empty block, `{ children: [{ text: '' }] }`. The block has no `type`, so if your schema requires one, pass your own empty block instead, for example `[{ type: 'paragraph', children: [{ text: '' }] }]`.

Changing `initialValue` afterwards has no effect. Use `value` for controlled content, apply transforms, or remount `Slate` with a new `key`.

Each editor must have its own node objects. To render several editors from the same value, give each one a deep copy, for example with `structuredClone(value)`. Sharing the same objects between editors breaks the lookups Slate uses to map nodes to the DOM.

#### `props.value?: Descendant[]`

Control the document with an external value and store editor changes with `onValueChange`. Passing both `value` and `initialValue` throws. The first value initializes the editor as `initialValue` does; later external changes are applied in a layout effect through `Transforms.setChildren`, preserving selection and recording operations for history.

The exact value object emitted by `onValueChange` is skipped when echoed back. Keep unchanged node objects when updating a value: identity makes unchanged subtrees cheap to recognize and lets moves preserve their selections. Deep-equal clones emit no operations but require a content comparison. External values are normalized; accept the normalized `onValueChange` result to converge.

Updates wait while the editor is composing or Android has a pending action or text diff. Only the latest pending value is applied after those finish; pending work is cancelled when the provider unmounts or its editor changes. This waits for native editing to finish; it does not merge conflicting edits made independently to the same content.

#### `props.applyValue?: (editor: ReactEditor, value: Descendant[]) => void`

Override how subsequent external values are applied. Defaults to `Transforms.setChildren`, which requires a Slate version providing that transform. `withHistory` makes each external change one separate undo step.

For a stream into a block separate from user typing, opt out of saving chunks:

```typescript
const applyValue = (editor: ReactEditor, value: Descendant[]) => {
  if (HistoryEditor.isHistoryEditor(editor)) {
    HistoryEditor.withoutSaving(editor, () =>
      Transforms.setChildren(editor, value)
    )
  } else {
    Transforms.setChildren(editor, value)
  }
}
```

`withoutSaving` does not transform older undo entries. If unsaved updates change paths or text offsets that those entries use, choose a history policy for your app rather than assuming undo stays valid. The controlled-value example streams into another block without changing the paths of typing operations.

#### `props.children: React.ReactNode`

The `children` which must contain an `Editable` component.

#### `props.onChange: (value: Descendant[]) => void`

An optional callback function which you can use to be notified of changes in the editor's value.

#### `props.onValueChange?: (value: Descendant[]) => void`

Like `props.onChange`, but only called when the editor's value changes, not for selection-only changes.

#### `props.onSelectionChange?: (selection: Selection) => void`

An optional callback function which you can use to be notified of changes of the editor's selection.
