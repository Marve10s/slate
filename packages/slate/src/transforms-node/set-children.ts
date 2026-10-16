import {
  Descendant,
  Editor,
  Element,
  Node,
  Path,
  PathRef,
  Text,
} from '../interfaces'
import { NodeTransforms } from '../interfaces/transforms/node'
import { NON_SETTABLE_NODE_PROPERTIES } from '../interfaces/transforms/general'
import { isDeepEqual } from '../utils/deep-equal'

const edges = (before: Descendant[], after: Descendant[]) => {
  let start = 0
  let suffix = 0
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++
  while (
    suffix < before.length - start &&
    suffix < after.length - start &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++
  return { start, suffix }
}

export const setChildren: NodeTransforms['setChildren'] = (
  editor,
  children
) => {
  if (children === editor.children) return
  const sources = new Map<Descendant, PathRef>()
  const wanted = new Set<Descendant>()
  const refs: PathRef[] = []
  const cleanups: { parent: PathRef; length: number; suffix: number }[] = []
  const reference = (path: Path) => {
    const ref = Editor.pathRef(editor, path)
    refs.push(ref)
    return ref
  }
  const rememberSource = (node: Descendant, path: Path) => {
    if (!sources.has(node)) sources.set(node, reference(path))
  }
  const rememberTree = (node: Descendant, path: Path) => {
    for (const [child, relative] of Node.nodes(node)) {
      if (!Editor.isEditor(child)) rememberSource(child, path.concat(relative))
    }
  }
  const wantTree = (node: Descendant) => {
    for (const [child] of Node.nodes(node)) {
      if (!Editor.isEditor(child)) wanted.add(child)
    }
  }
  const prepare = (before: Descendant[], after: Descendant[], path: Path) => {
    const { start, suffix } = edges(before, after)
    const end = Math.max(before.length, after.length) - suffix
    for (let i = start; i < end; i++) {
      const old = i < before.length - suffix ? before[i] : undefined
      const next = i < after.length - suffix ? after[i] : undefined
      if (old) rememberSource(old, path.concat(i))
      if (next) wanted.add(next)
      if (Element.isElement(old) && Element.isElement(next)) {
        prepare(old.children, next.children, path.concat(i))
      } else {
        if (old) rememberTree(old, path.concat(i))
        if (next) wantTree(next)
      }
    }
  }
  const consume = (node: Descendant) => {
    for (const [child] of Node.nodes(node)) {
      if (!Editor.isEditor(child)) sources.delete(child)
    }
  }
  const containsSource = (node: Descendant) => {
    for (const [child] of Node.nodes(node)) {
      if (
        !Editor.isEditor(child) &&
        wanted.has(child) &&
        sources.get(child)?.current
      )
        return true
    }
    return false
  }
  const setProperties = (before: Descendant, after: Descendant, path: Path) => {
    const old = new Map(Object.entries(Node.extractProps(before)))
    const next = new Map(Object.entries(Node.extractProps(after)))
    const changed = [...new Set([...old.keys(), ...next.keys()])].filter(
      key =>
        !NON_SETTABLE_NODE_PROPERTIES.includes(key) &&
        !isDeepEqual(old.get(key), next.get(key))
    )
    if (changed.length)
      editor.apply({
        type: 'set_node',
        path,
        properties: Object.fromEntries(changed.map(key => [key, old.get(key)])),
        newProperties: Object.fromEntries(
          changed.map(key => [key, next.get(key)])
        ),
      })
  }
  const reconcile = (parentPath: Path, after: Descendant[]) => {
    const parent = reference(parentPath)
    const before = Node.ancestor(editor, parentPath).children
    const { start, suffix } = edges(before, after)
    if (start === before.length && start === after.length) return
    cleanups.push({ parent, length: after.length, suffix })
    for (let i = start; i < after.length - suffix; i++) {
      let path = parent.current!.concat(i)
      const next = after[i]
      const source = sources.get(next)
      if (source?.current) {
        if (!Path.equals(source.current, path))
          editor.apply({
            type: 'move_node',
            path: source.current,
            newPath: path,
          })
        consume(next)
        continue
      }
      const siblings = Node.ancestor(editor, parent.current!).children
      const current = i < siblings.length - suffix ? siblings[i] : undefined
      if (current === next) {
        consume(next)
        continue
      }
      const reserved =
        current && wanted.has(current) && sources.get(current)?.current
      const sameKind =
        current &&
        Text.isText(current) === Text.isText(next) &&
        NON_SETTABLE_NODE_PROPERTIES.every(
          key =>
            key === 'text' ||
            key === 'children' ||
            isDeepEqual(
              Object.getOwnPropertyDescriptor(current, key)?.value,
              Object.getOwnPropertyDescriptor(next, key)?.value
            )
        )
      if (current && !reserved && sameKind) {
        if (isDeepEqual(current, next)) continue
        setProperties(current, next, path)
        if (Text.isText(current) && Text.isText(next)) {
          let prefix = 0
          let end = 0
          while (
            prefix < current.text.length &&
            prefix < next.text.length &&
            current.text[prefix] === next.text[prefix]
          )
            prefix++
          while (
            end < current.text.length - prefix &&
            end < next.text.length - prefix &&
            current.text[current.text.length - 1 - end] ===
              next.text[next.text.length - 1 - end]
          )
            end++
          const removed = current.text.slice(prefix, current.text.length - end)
          const inserted = next.text.slice(prefix, next.text.length - end)
          if (removed)
            editor.apply({
              type: 'remove_text',
              path,
              offset: prefix,
              text: removed,
            })
          if (inserted)
            editor.apply({
              type: 'insert_text',
              path,
              offset: prefix,
              text: inserted,
            })
        } else if (Element.isElement(next)) reconcile(path, next.children)
      } else {
        if (current && !containsSource(current))
          editor.apply({ type: 'remove_node', path, node: current })
        path = parent.current!.concat(i)
        const split = Element.isElement(next) && containsSource(next)
        editor.apply({
          type: 'insert_node',
          path,
          node: split ? { ...next, children: [] } : next,
        })
        if (split && Element.isElement(next)) reconcile(path, next.children)
      }
    }
  }
  try {
    prepare(editor.children, children, [])
    Editor.withoutNormalizing(editor, () => {
      reconcile([], children)
      for (const { parent, length, suffix } of cleanups.reverse()) {
        const path = parent.current!
        while (Node.ancestor(editor, path).children.length > length) {
          const at = path.concat(length - suffix)
          editor.apply({
            type: 'remove_node',
            path: at,
            node: Node.descendant(editor, at),
          })
        }
      }
    })
  } finally {
    for (const ref of refs) ref.unref()
  }
}
