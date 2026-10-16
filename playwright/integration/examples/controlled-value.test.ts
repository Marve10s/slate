import { expect, test } from '@playwright/test'
import { getEditorHandle } from '../support/editor'

const stream =
  'External text can arrive while you keep typing in another block.'

test('streaming preserves typed text and the caret in another block', async ({
  page,
}) => {
  await page.goto('/examples/controlled-value')
  const textbox = page.getByRole('textbox', { name: 'Controlled editor' })
  await textbox.click()
  const editor = await getEditorHandle(textbox)
  await editor.evaluate(editor => editor.select(editor.end([0])))
  await page.getByRole('button', { name: 'Start stream' }).click()
  await page.keyboard.type('user text', { delay: 80 })
  await expect(page.locator('output')).toHaveText('Complete')
  await expect
    .poll(() =>
      editor.evaluate(editor => [editor.string([0]), editor.string([1])])
    )
    .toEqual(['Type here: user text', stream])
  await expect
    .poll(() => editor.evaluate(editor => editor.selection))
    .toEqual({
      anchor: { path: [0, 0], offset: 20 },
      focus: { path: [0, 0], offset: 20 },
    })
  await page.keyboard.press('ControlOrMeta+z')
  await expect
    .poll(() =>
      editor.evaluate(editor => [editor.string([0]), editor.string([1])])
    )
    .toEqual(['Type here: ', stream])
})

test('holds streamed updates until composition ends', async ({ page }) => {
  await page.goto('/examples/controlled-value')
  const textbox = page.getByRole('textbox', { name: 'Controlled editor' })
  await textbox.click()
  const editor = await getEditorHandle(textbox)
  await textbox.dispatchEvent('compositionstart', { data: '' })
  await page
    .getByRole('button', { name: 'Start stream' })
    .evaluate(button => button.click())
  await expect(page.locator('output')).toHaveText('Complete')
  expect(await editor.evaluate(editor => editor.string([1]))).toBe(
    'Stream output will appear here.'
  )
  await textbox.dispatchEvent('compositionend', { data: '' })
  await expect
    .poll(() => editor.evaluate(editor => editor.string([1])))
    .toBe(stream)
})
