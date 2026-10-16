---
'slate': minor
'slate-react': minor
'slate-history': minor
---

Add `Transforms.setChildren` and the overridable `editor.setChildren` method for external document updates through Slate operations. The diff preserves unchanged identities, moves shared nodes across parents, and maps selection through text and structure changes before normalizing once.

Add controlled `value` and `applyValue` props to Slate. External updates apply in a layout effect, echoed editor values are skipped, and updates wait for composition and pending Android input. Existing `initialValue` behavior is unchanged; using it together with `value` throws.

`withHistory` records each external change as one undo step, separate from surrounding typing. Apps can customize `applyValue` for unsaved streams, which do not rebase older history entries.

`BaseEditor` now requires `setChildren`. `createEditor` supplies it automatically; structurally constructed editors and mocks must implement it. The controlled default requires a Slate peer with `Transforms.setChildren`; uncontrolled use retains the existing supported peer ranges.
