import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { kutexGlyphWhite } from '@/shared/assets/icons'
import FolderPanel from './FolderPanel.vue'

const mocks = vi.hoisted(() => ({
  getFolders: vi.fn<(dirPath: string) => Promise<string[] | null>>(),
  getFoldersRecursive: vi.fn<(root: string) => Promise<string[] | null>>(),
}))

vi.mock('../api/system-api', () => ({
  getFolders: mocks.getFolders,
  getFoldersRecursive: mocks.getFoldersRecursive,
}))

const FOLDERS = ['src', 'internal', 'frontend', 'build']
const RECURSIVE_FOLDERS = ['src', 'src/app', 'internal', 'internal/system', 'frontend']

describe('folderPanel', () => {
  let wrapper: VueWrapper
  let scrollIntoView: ReturnType<typeof vi.fn>

  async function mountPanel(props: { rootPath?: string } = {}) {
    wrapper = mount(FolderPanel, { props, attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  const input = () => wrapper.get('input')
  const items = () => wrapper.findAll('[role="option"]')
  const itemTexts = () => items().map(item => item.text())
  const selectedText = () => wrapper.get('[aria-selected="true"]').text()
  const recursiveButton = () => wrapper.get('button')
  const press = (key: string) => input().trigger('keydown', { key })
  const search = (text: string) => input().setValue(text)

  beforeEach(() => {
    mocks.getFolders.mockReset()
    mocks.getFoldersRecursive.mockReset()
    mocks.getFolders.mockResolvedValue(FOLDERS)
    mocks.getFoldersRecursive.mockResolvedValue(RECURSIVE_FOLDERS)

    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView']
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('rendering & loading', () => {
    it('loads direct folders for "." by default and renders an accessible dialog', async () => {
      await mountPanel()

      expect(mocks.getFolders).toHaveBeenCalledExactlyOnceWith('.')
      expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Folder navigator')
      expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
      expect(wrapper.get('img[alt="Kutex"]').attributes('src')).toBe(kutexGlyphWhite)
      expect(itemTexts()).toEqual(FOLDERS)
      expect(document.activeElement).toBe(input().element)
    })

    it('passes custom rootPath to getFolders and displays it in the header', async () => {
      await mountPanel({ rootPath: '/home/vlad/projects/kutex' })

      expect(mocks.getFolders).toHaveBeenCalledExactlyOnceWith('/home/vlad/projects/kutex')
      expect(wrapper.text()).toContain('/home/vlad/projects/kutex')
    })

    it('shows a loading message while folders are being fetched', async () => {
      let resolvePending!: (folders: string[]) => void
      mocks.getFolders.mockReturnValueOnce(new Promise((resolve) => {
        resolvePending = resolve
      }))

      wrapper = mount(FolderPanel, { attachTo: document.body })
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Loading folders…')

      resolvePending(['alpha'])
      await flushPromises()

      expect(wrapper.text()).not.toContain('Loading folders…')
      expect(itemTexts()).toEqual(['alpha'])
    })

    it('handles null response from Go backend as an empty folder list', async () => {
      mocks.getFolders.mockResolvedValueOnce(null)
      await mountPanel()

      expect(items()).toHaveLength(0)
      expect(wrapper.text()).toContain('No folders found')
    })

    it('displays an alert when getFolders rejects with an error', async () => {
      mocks.getFolders.mockRejectedValueOnce(new Error('read directory "/bad": no such file or directory'))
      await mountPanel({ rootPath: '/bad' })

      expect(wrapper.get('[role="alert"]').text()).toBe('read directory "/bad": no such file or directory')
      expect(items()).toHaveLength(0)
    })

    it('reloads folders when rootPath prop changes', async () => {
      await mountPanel({ rootPath: '/first' })
      mocks.getFolders.mockResolvedValueOnce(['nested-a', 'nested-b'])

      await wrapper.setProps({ rootPath: '/second' })
      await flushPromises()

      expect(mocks.getFolders).toHaveBeenLastCalledWith('/second')
      expect(itemTexts()).toEqual(['nested-a', 'nested-b'])
    })

    it('ignores stale responses when a newer request starts before the previous resolves', async () => {
      let resolveFirst!: (folders: string[]) => void
      mocks.getFolders.mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve
      }))

      wrapper = mount(FolderPanel, { props: { rootPath: '/first' }, attachTo: document.body })
      mocks.getFolders.mockResolvedValueOnce(['fresh-folder'])
      await wrapper.setProps({ rootPath: '/second' })
      await flushPromises()

      resolveFirst(['stale-folder'])
      await flushPromises()

      expect(itemTexts()).toEqual(['fresh-folder'])
    })
  })

  describe('recursive mode toggle', () => {
    it('switches between getFolders and getFoldersRecursive when toggling the button', async () => {
      await mountPanel({ rootPath: '/repo' })

      expect(recursiveButton().text()).toBe('Recursive: Off')
      expect(recursiveButton().attributes('aria-pressed')).toBe('false')

      await recursiveButton().trigger('click')
      await flushPromises()

      expect(mocks.getFoldersRecursive).toHaveBeenCalledExactlyOnceWith('/repo')
      expect(recursiveButton().text()).toBe('Recursive: On')
      expect(recursiveButton().attributes('aria-pressed')).toBe('true')
      expect(itemTexts()).toEqual(RECURSIVE_FOLDERS)
      expect(document.activeElement).toBe(input().element)

      await recursiveButton().trigger('click')
      await flushPromises()

      expect(mocks.getFolders).toHaveBeenCalledTimes(2)
      expect(recursiveButton().text()).toBe('Recursive: Off')
    })
  })

  describe('searching & filtering', () => {
    it('filters folders case-insensitively and trims whitespace', async () => {
      await mountPanel()

      await search('  INT  ')

      expect(itemTexts()).toEqual(['internal'])
      expect(selectedText()).toBe('internal')
    })

    it('shows "No matching folders" when filter matches nothing', async () => {
      await mountPanel()

      await search('nonexistent-folder')

      expect(items()).toHaveLength(0)
      expect(wrapper.text()).toContain('No matching folders')
    })
  })

  describe('keyboard & mouse navigation', () => {
    it('moves selection down and up with wrapping and scrolls into view', async () => {
      await mountPanel()

      expect(selectedText()).toBe('src')

      await press('ArrowDown')
      expect(selectedText()).toBe('internal')
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })

      await press('ArrowUp')
      expect(selectedText()).toBe('src')

      await press('ArrowUp')
      expect(selectedText()).toBe('build')

      await press('ArrowDown')
      expect(selectedText()).toBe('src')
    })

    it('does nothing on ArrowDown or ArrowUp when the list is empty', async () => {
      mocks.getFolders.mockResolvedValueOnce([])
      await mountPanel()

      await press('ArrowDown')
      await press('ArrowUp')

      expect(scrollIntoView).not.toHaveBeenCalled()
    })

    it('ignores unhandled keys on the filter input', async () => {
      await mountPanel()

      await press('Tab')

      expect(selectedText()).toBe('src')
      expect(wrapper.emitted('select')).toBeUndefined()
      expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('emits select with the highlighted folder on Enter', async () => {
      await mountPanel()
      await press('ArrowDown')

      await press('Enter')

      expect(wrapper.emitted('select')).toEqual([['internal']])
    })

    it('does not emit select on Enter when no folder matches', async () => {
      await mountPanel()
      await search('nothing-matches')

      await press('Enter')

      expect(wrapper.emitted('select')).toBeUndefined()
    })

    it('updates selection on mousemove and emits select on click', async () => {
      await mountPanel()

      await items()[2]!.trigger('mousemove')
      expect(selectedText()).toBe('frontend')

      await items()[2]!.trigger('click')
      expect(wrapper.emitted('select')).toEqual([['frontend']])
    })

    it('emits close on Escape or backdrop mousedown, but not dialog mousedown', async () => {
      await mountPanel()

      await wrapper.get('[role="dialog"]').trigger('mousedown')
      expect(wrapper.emitted('close')).toBeUndefined()

      await press('Escape')
      expect(wrapper.emitted('close')).toHaveLength(1)

      await wrapper.trigger('mousedown')
      expect(wrapper.emitted('close')).toHaveLength(2)
    })
  })
})
