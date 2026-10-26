import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { kutexGlyphWhite } from '@/shared/assets/icons'
import HistoryPanel from './HistoryPanel.vue'

const COMMANDS = ['git status', 'npm run build', 'ls -la', 'Git Log --oneline', 'docker ps']

describe('historyPanel', () => {
  let wrapper: VueWrapper
  let scrollIntoView: ReturnType<typeof vi.fn>

  function mountPanel(commands: string[] = COMMANDS) {
    wrapper = mount(HistoryPanel, { props: { commands }, attachTo: document.body })
    return wrapper
  }

  const input = () => wrapper.get('input')
  const items = () => wrapper.findAll('[role="option"]')
  const itemTexts = () => items().map(item => item.text())
  const selectedText = () => wrapper.get('[aria-selected="true"]').text()
  const clearButton = () => wrapper.get('button')
  const press = (key: string) => input().trigger('keydown', { key })
  const search = (text: string) => input().setValue(text)

  beforeEach(() => {
    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView']
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('rendering', () => {
    it('renders an accessible dialog with a listbox of commands', () => {
      mountPanel()

      expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Command history')
      expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
      expect(wrapper.get('img[alt="Kutex"]').attributes('src')).toBe(kutexGlyphWhite)
    })

    it('lists every command in the given order (most recent first)', () => {
      mountPanel()

      expect(itemTexts()).toEqual(COMMANDS)
    })

    it('shows the full command in a tooltip, since long ones are truncated', () => {
      mountPanel(['kubectl get pods --all-namespaces -o wide'])

      expect(items()[0]!.attributes('title')).toBe('kubectl get pods --all-namespaces -o wide')
    })

    it('shows an empty state and disables Clear history when there are no commands', () => {
      mountPanel([])

      expect(items()).toHaveLength(0)
      expect(wrapper.text()).toContain('No commands yet')
      expect(clearButton().attributes('disabled')).toBeDefined()
    })

    it('enables Clear history when there are commands', () => {
      mountPanel()

      expect(clearButton().attributes('disabled')).toBeUndefined()
    })

    it('shows the keyboard hints', () => {
      mountPanel()

      expect(wrapper.text()).toContain('↑↓ select · Enter run · Esc close')
    })

    it('focuses the search input when opened', () => {
      mountPanel()

      expect(document.activeElement).toBe(input().element)
    })

    it('selects the most recent command initially', () => {
      mountPanel()

      expect(selectedText()).toBe('git status')
      expect(wrapper.findAll('[aria-selected="true"]')).toHaveLength(1)
    })

    it('updates the list when the commands prop changes', async () => {
      mountPanel(['ls'])

      await wrapper.setProps({ commands: ['pwd', 'ls'] })

      expect(itemTexts()).toEqual(['pwd', 'ls'])
    })
  })

  describe('searching', () => {
    it('filters commands by substring', async () => {
      mountPanel()

      await search('build')

      expect(itemTexts()).toEqual(['npm run build'])
    })

    it('matches case-insensitively', async () => {
      mountPanel()

      await search('GIT')

      expect(itemTexts()).toEqual(['git status', 'Git Log --oneline'])
    })

    it('ignores surrounding whitespace in the query', async () => {
      mountPanel()

      await search('   docker  ')

      expect(itemTexts()).toEqual(['docker ps'])
    })

    it('shows every command again when the query is cleared', async () => {
      mountPanel()

      await search('docker')
      await search('')

      expect(itemTexts()).toEqual(COMMANDS)
    })

    it('shows "No matching commands" when nothing matches', async () => {
      mountPanel()

      await search('kubectl')

      expect(items()).toHaveLength(0)
      expect(wrapper.text()).toContain('No matching commands')
      expect(clearButton().attributes('disabled')).toBeUndefined()
    })

    it('selects the first match whenever the query changes', async () => {
      mountPanel()
      await press('ArrowDown')
      await press('ArrowDown')
      expect(selectedText()).toBe('ls -la')

      await search('git')

      expect(selectedText()).toBe('git status')
    })
  })

  describe('keyboard navigation', () => {
    it('moves the selection down with ArrowDown', async () => {
      mountPanel()

      await press('ArrowDown')

      expect(selectedText()).toBe('npm run build')
    })

    it('moves the selection up with ArrowUp', async () => {
      mountPanel()
      await press('ArrowDown')
      await press('ArrowDown')

      await press('ArrowUp')

      expect(selectedText()).toBe('npm run build')
    })

    it('wraps from the last command to the first', async () => {
      mountPanel()

      for (let i = 0; i < COMMANDS.length; i++) {
        await press('ArrowDown')
      }

      expect(selectedText()).toBe('git status')
    })

    it('wraps from the first command to the last', async () => {
      mountPanel()

      await press('ArrowUp')

      expect(selectedText()).toBe('docker ps')
    })

    it('navigates within the filtered results only', async () => {
      mountPanel()
      await search('git')

      await press('ArrowDown')
      expect(selectedText()).toBe('Git Log --oneline')

      await press('ArrowDown')
      expect(selectedText()).toBe('git status')
    })

    it('scrolls the selected command into view', async () => {
      mountPanel()

      await press('ArrowDown')
      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }))

      expect(scrollIntoView.mock.contexts.at(-1)).toBe(items()[1]!.element)
    })

    it('does nothing on arrow keys when nothing matches', async () => {
      mountPanel()
      await search('kubectl')

      await press('ArrowDown')
      await press('ArrowUp')

      expect(scrollIntoView).not.toHaveBeenCalled()
      expect(wrapper.find('[aria-selected="true"]').exists()).toBe(false)
    })

    it('ignores keys without a shortcut', async () => {
      mountPanel()

      await press('Tab')
      await press('a')
      await press('PageDown')

      expect(selectedText()).toBe('git status')
      expect(wrapper.emitted()).not.toHaveProperty('run')
      expect(wrapper.emitted()).not.toHaveProperty('close')
    })

    it('prevents the default action of keys pressed in the search input', async () => {
      mountPanel()
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })

      input().element.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
    })
  })

  describe('running a command', () => {
    it('emits run with the selected command when Enter is pressed', async () => {
      mountPanel()
      await press('ArrowDown')

      await press('Enter')

      expect(wrapper.emitted('run')).toEqual([['npm run build']])
    })

    it('emits run with the first match after searching', async () => {
      mountPanel()
      await search('docker')

      await press('Enter')

      expect(wrapper.emitted('run')).toEqual([['docker ps']])
    })

    it('does not emit run when Enter is pressed and nothing matches', async () => {
      mountPanel()
      await search('kubectl')

      await press('Enter')

      expect(wrapper.emitted('run')).toBeUndefined()
    })

    it('does not emit run when Enter is pressed and the history is empty', async () => {
      mountPanel([])

      await press('Enter')

      expect(wrapper.emitted('run')).toBeUndefined()
    })

    it('emits run with the clicked command', async () => {
      mountPanel()

      await items()[2]!.trigger('click')

      expect(wrapper.emitted('run')).toEqual([['ls -la']])
    })

    it('emits run with the clicked command among the filtered results', async () => {
      mountPanel()
      await search('git')

      await items()[1]!.trigger('click')

      expect(wrapper.emitted('run')).toEqual([['Git Log --oneline']])
    })

    it('highlights the command under the mouse pointer', async () => {
      mountPanel()

      await items()[3]!.trigger('mousemove')

      expect(selectedText()).toBe('Git Log --oneline')
    })

    it('runs the hovered command when Enter is pressed afterwards', async () => {
      mountPanel()
      await items()[4]!.trigger('mousemove')

      await press('Enter')

      expect(wrapper.emitted('run')).toEqual([['docker ps']])
    })
  })

  describe('closing and clearing', () => {
    it('emits close when Escape is pressed', async () => {
      mountPanel()

      await press('Escape')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('emits close when the backdrop is clicked', async () => {
      mountPanel()

      await wrapper.trigger('mousedown')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('does not close when clicking inside the dialog', async () => {
      mountPanel()

      await wrapper.get('[role="dialog"]').trigger('mousedown')
      await input().trigger('mousedown')
      await items()[0]!.trigger('mousedown')

      expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('emits clear when Clear history is clicked', async () => {
      mountPanel()

      await clearButton().trigger('click')

      expect(wrapper.emitted('clear')).toHaveLength(1)
      expect(wrapper.emitted('run')).toBeUndefined()
    })

    it('does not emit clear when the disabled button is clicked', async () => {
      mountPanel([])

      await clearButton().trigger('click')

      expect(wrapper.emitted('clear')).toBeUndefined()
    })
  })
})
