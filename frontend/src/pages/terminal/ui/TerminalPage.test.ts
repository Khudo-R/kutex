import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { HistoryPanel } from '@/features/command-history'
import { FolderPanel } from '@/features/folder-navigator'
import TerminalPage from './TerminalPage.vue'

const mocks = vi.hoisted(() => {
  const startTerminal = vi.fn<(...args: [number, number]) => Promise<void>>()
  const writeTerminal = vi.fn<(...args: [string]) => Promise<void>>()
  const resizeTerminal = vi.fn<(...args: [number, number]) => Promise<void>>()
  const runCommand = vi.fn<(...args: [string]) => Promise<void>>()
  const getCwd = vi.fn<() => Promise<string>>()
  const addHistory = vi.fn<(...args: [string]) => Promise<void>>()
  const getHistory = vi.fn<() => Promise<string[]>>()
  const clearHistory = vi.fn<() => Promise<void>>()
  const getFolders = vi.fn<(...args: [string]) => Promise<string[]>>()
  const getFoldersRecursive = vi.fn<(...args: [string]) => Promise<string[]>>()

  let outputListener: ((bytes: Uint8Array) => void) | undefined
  let exitListener: ((exitCode: number) => void) | undefined
  const offOutput = vi.fn()
  const offExit = vi.fn()

  const onTerminalOutput = vi.fn((listener: (bytes: Uint8Array) => void) => {
    outputListener = listener
    return offOutput
  })

  const onTerminalExit = vi.fn((listener: (exitCode: number) => void) => {
    exitListener = listener
    return offExit
  })

  const captureInput = vi.fn<(data: string) => string | undefined>()
  const captureReset = vi.fn()
  class FakeCommandCapture {
    static instances: FakeCommandCapture[] = []
    input = captureInput
    reset = captureReset
    constructor(readonly term: unknown) {
      FakeCommandCapture.instances.push(this)
    }
  }

  return {
    startTerminal,
    writeTerminal,
    resizeTerminal,
    runCommand,
    getCwd,
    addHistory,
    getHistory,
    clearHistory,
    getFolders,
    getFoldersRecursive,
    onTerminalOutput,
    onTerminalExit,
    getOutputListener: () => outputListener!,
    getExitListener: () => exitListener!,
    offOutput,
    offExit,
    FakeCommandCapture,
    captureInput,
    captureReset,
  }
})

vi.mock('@/entities/terminal', () => ({
  startTerminal: mocks.startTerminal,
  writeTerminal: mocks.writeTerminal,
  resizeTerminal: mocks.resizeTerminal,
  runCommand: mocks.runCommand,
  getCwd: mocks.getCwd,
  onTerminalOutput: mocks.onTerminalOutput,
  onTerminalExit: mocks.onTerminalExit,
  XTerminal: { name: 'XTerminal' },
}))

vi.mock('@/features/command-history', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/command-history')>(),
  addHistory: mocks.addHistory,
  getHistory: mocks.getHistory,
  clearHistory: mocks.clearHistory,
  CommandCapture: mocks.FakeCommandCapture,
}))

vi.mock('@/features/folder-navigator/api/system-api', () => ({
  getFolders: mocks.getFolders,
  getFoldersRecursive: mocks.getFoldersRecursive,
}))

interface FakeXTermInstance {
  cols: number
  rows: number
  keyHandler?: (e: KeyboardEvent) => boolean
  attachCustomKeyEventHandler: ReturnType<typeof vi.fn>
}

function createFakeXTerm(cols = 100, rows = 30): FakeXTermInstance {
  const instance: FakeXTermInstance = {
    cols,
    rows,
    attachCustomKeyEventHandler: vi.fn((handler: (e: KeyboardEvent) => boolean) => {
      instance.keyHandler = handler
    }),
  }
  return instance
}

describe('terminalPage', () => {
  let wrapper: VueWrapper | undefined
  let termWrite: ReturnType<typeof vi.fn>
  let termWriteln: ReturnType<typeof vi.fn>
  let termClear: ReturnType<typeof vi.fn>
  let termFocus: ReturnType<typeof vi.fn>
  let termRef: ReturnType<typeof ref<FakeXTermInstance | undefined>>
  let fakeXTerm: FakeXTermInstance

  const XTerminalStub = defineComponent({
    name: 'XTerminal',
    emits: ['ready', 'data', 'resize'],
    setup(_, { expose }) {
      expose({
        write: termWrite,
        writeln: termWriteln,
        clear: termClear,
        focus: termFocus,
        term: termRef,
      })
      return () => h('div', { class: 'x-terminal-stub' })
    },
  })

  function mountPage() {
    wrapper = mount(TerminalPage, {
      global: {
        stubs: {
          XTerminal: XTerminalStub,
        },
      },
    })
    return wrapper
  }

  function emitReady(term = fakeXTerm) {
    wrapper!.findComponent(XTerminalStub).vm.$emit('ready', term)
  }

  function emitData(data: string) {
    wrapper!.findComponent(XTerminalStub).vm.$emit('data', data)
  }

  function emitResize(cols: number, rows: number) {
    wrapper!.findComponent(XTerminalStub).vm.$emit('resize', { cols, rows })
  }

  beforeEach(() => {
    mocks.startTerminal.mockResolvedValue(undefined)
    mocks.writeTerminal.mockResolvedValue(undefined)
    mocks.resizeTerminal.mockResolvedValue(undefined)
    mocks.runCommand.mockResolvedValue(undefined)
    mocks.getCwd.mockResolvedValue('/home/vlad/projects/kutex')
    mocks.addHistory.mockResolvedValue(undefined)
    mocks.getHistory.mockResolvedValue(['git status', 'ls -la'])
    mocks.clearHistory.mockResolvedValue(undefined)
    mocks.getFolders.mockResolvedValue(['src', 'internal'])
    mocks.getFoldersRecursive.mockResolvedValue(['src', 'internal'])

    mocks.FakeCommandCapture.instances = []
    mocks.captureInput.mockReturnValue(undefined)

    termWrite = vi.fn()
    termWriteln = vi.fn()
    termClear = vi.fn()
    termFocus = vi.fn()
    fakeXTerm = createFakeXTerm(100, 30)
    termRef = ref<FakeXTermInstance | undefined>(fakeXTerm)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  describe('terminal runtime events & lifecycle', () => {
    it('subscribes to output and exit on setup and unsubscribes on unmount', () => {
      mountPage()

      expect(mocks.onTerminalOutput).toHaveBeenCalledExactlyOnceWith(expect.any(Function))
      expect(mocks.onTerminalExit).toHaveBeenCalledExactlyOnceWith(expect.any(Function))

      wrapper!.unmount()
      wrapper = undefined

      expect(mocks.offOutput).toHaveBeenCalledOnce()
      expect(mocks.offExit).toHaveBeenCalledOnce()
    })

    it('writes decoded output bytes to XTerminal', () => {
      mountPage()
      const bytes = new Uint8Array([104, 101, 108, 108, 111])

      mocks.getOutputListener()(bytes)

      expect(termWrite).toHaveBeenCalledExactlyOnceWith(bytes)
    })

    it('prints an exit banner and marks the shell as exited on exit event', () => {
      mountPage()
      emitReady()

      mocks.getExitListener()(130)

      expect(termWriteln).toHaveBeenCalledExactlyOnceWith(
        '\r\n\x1B[2m[process exited with code 130, press Enter to restart]\x1B[0m',
      )

      emitData('a')
      expect(mocks.writeTerminal).not.toHaveBeenCalled()
    })
  })

  describe('shell startup & ready handling', () => {
    it('creates CommandCapture, attaches key handler, and starts the shell with terminal dimensions', () => {
      mountPage()

      emitReady()

      expect(mocks.FakeCommandCapture.instances).toHaveLength(1)
      expect(mocks.FakeCommandCapture.instances[0]!.term).toBe(fakeXTerm)
      expect(fakeXTerm.attachCustomKeyEventHandler).toHaveBeenCalledExactlyOnceWith(expect.any(Function))
      expect(mocks.captureReset).toHaveBeenCalledOnce()
      expect(mocks.startTerminal).toHaveBeenCalledExactlyOnceWith(100, 30)
    })

    it('prints an error message and marks shell as exited if startTerminal fails', async () => {
      mocks.startTerminal.mockRejectedValueOnce('spawn failed')
      mountPage()

      emitReady()
      await flushPromises()

      expect(termWriteln).toHaveBeenCalledExactlyOnceWith(
        '\x1B[1;31mFailed to start shell: spawn failed\x1B[0m',
      )

      emitData('x')
      expect(mocks.writeTerminal).not.toHaveBeenCalled()
    })
  })

  describe('user input & restarting after exit', () => {
    it('forwards keystrokes to writeTerminal without recording history when no command is submitted', () => {
      mountPage()
      emitReady()

      emitData('l')

      expect(mocks.captureInput).toHaveBeenCalledExactlyOnceWith('l')
      expect(mocks.addHistory).not.toHaveBeenCalled()
      expect(mocks.writeTerminal).toHaveBeenCalledExactlyOnceWith('l')
    })

    it('records the command in history and forwards Enter when CommandCapture returns a command', () => {
      mocks.captureInput.mockReturnValueOnce('git status')
      mountPage()
      emitReady()

      emitData('\r')

      expect(mocks.captureInput).toHaveBeenCalledExactlyOnceWith('\r')
      expect(mocks.addHistory).toHaveBeenCalledExactlyOnceWith('git status')
      expect(mocks.writeTerminal).toHaveBeenCalledExactlyOnceWith('\r')
    })

    it('logs errors when addHistory or writeTerminal rejects', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mocks.captureInput.mockReturnValueOnce('ls')
      mocks.addHistory.mockRejectedValueOnce(new Error('history error'))
      mocks.writeTerminal.mockRejectedValueOnce(new Error('write error'))
      mountPage()
      emitReady()

      emitData('\r')
      await flushPromises()

      expect(errorSpy).toHaveBeenCalledWith('recording history failed:', expect.any(Error))
      expect(errorSpy).toHaveBeenCalledWith('terminal write failed:', expect.any(Error))
      errorSpy.mockRestore()
    })

    it('clears the screen and restarts the shell when Enter is pressed after exit', () => {
      mountPage()
      emitReady()
      mocks.startTerminal.mockClear()

      mocks.getExitListener()(0)
      emitData('\r')

      expect(termClear).toHaveBeenCalledOnce()
      expect(mocks.startTerminal).toHaveBeenCalledExactlyOnceWith(100, 30)
    })

    it('falls back to 80x24 when restarting if the underlying term ref is undefined', () => {
      mountPage()
      emitReady()
      mocks.startTerminal.mockClear()
      termRef.value = undefined

      mocks.getExitListener()(0)
      emitData('\r')

      expect(termClear).toHaveBeenCalledOnce()
      expect(mocks.startTerminal).toHaveBeenCalledExactlyOnceWith(80, 24)
    })
  })

  describe('terminal resize', () => {
    it('forwards new dimensions to resizeTerminal and logs errors on failure', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mocks.resizeTerminal.mockRejectedValueOnce(new Error('resize error'))
      mountPage()

      emitResize(120, 45)
      await flushPromises()

      expect(mocks.resizeTerminal).toHaveBeenCalledExactlyOnceWith(120, 45)
      expect(errorSpy).toHaveBeenCalledWith('terminal resize failed:', expect.any(Error))
      errorSpy.mockRestore()
    })
  })

  describe('history shortcut & HistoryPanel workflow', () => {
    it('lets normal keys pass through the custom key handler', () => {
      mountPage()
      emitReady()

      expect(fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyA' }))).toBe(true)
      expect(fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true }))).toBe(true)
      expect(fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true, shiftKey: true, altKey: true }))).toBe(true)
      expect(fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true, shiftKey: true, metaKey: true }))).toBe(true)
    })

    it('intercepts Ctrl+Shift+H on keydown to load and open the HistoryPanel', async () => {
      mountPage()
      emitReady()

      const keydown = new KeyboardEvent('keydown', {
        code: 'KeyH',
        ctrlKey: true,
        shiftKey: true,
        cancelable: true,
      })
      const allowed = fakeXTerm.keyHandler!(keydown)
      await flushPromises()

      expect(allowed).toBe(false)
      expect(keydown.defaultPrevented).toBe(true)
      expect(mocks.getHistory).toHaveBeenCalledOnce()
      const panel = wrapper!.findComponent(HistoryPanel)
      expect(panel.exists()).toBe(true)
      expect(panel.props('commands')).toEqual(['git status', 'ls -la'])
    })

    it('blocks Ctrl+Shift+H on keyup without fetching history again', () => {
      mountPage()
      emitReady()

      const keyup = new KeyboardEvent('keyup', {
        code: 'KeyH',
        ctrlKey: true,
        shiftKey: true,
      })
      expect(fakeXTerm.keyHandler!(keyup)).toBe(false)
      expect(mocks.getHistory).not.toHaveBeenCalled()
    })

    it('keeps the panel closed and logs an error when getHistory fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mocks.getHistory.mockRejectedValueOnce(new Error('backend error'))
      mountPage()
      emitReady()

      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      expect(errorSpy).toHaveBeenCalledWith('loading history failed:', expect.any(Error))
      expect(wrapper!.findComponent(HistoryPanel).exists()).toBe(false)
      errorSpy.mockRestore()
    })

    it('closes the panel and refocuses the terminal on close event', async () => {
      mountPage()
      emitReady()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      wrapper!.findComponent(HistoryPanel).vm.$emit('close')
      await flushPromises()

      expect(wrapper!.findComponent(HistoryPanel).exists()).toBe(false)
      expect(termFocus).toHaveBeenCalledOnce()
    })

    it('clears the current prompt line and runs the selected command from history', async () => {
      mountPage()
      emitReady()
      mocks.captureReset.mockClear()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      wrapper!.findComponent(HistoryPanel).vm.$emit('run', 'git status')
      await flushPromises()

      expect(wrapper!.findComponent(HistoryPanel).exists()).toBe(false)
      expect(termFocus).toHaveBeenCalledOnce()
      expect(mocks.captureReset).toHaveBeenCalledOnce()
      expect(mocks.writeTerminal).toHaveBeenCalledExactlyOnceWith('\x05\x15')
      expect(mocks.runCommand).toHaveBeenCalledExactlyOnceWith('git status')
    })

    it('does not write or run the command if the shell exited while the history panel was open', async () => {
      mountPage()
      emitReady()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true, shiftKey: true }))
      await flushPromises()
      mocks.getExitListener()(0)

      wrapper!.findComponent(HistoryPanel).vm.$emit('run', 'git status')
      await flushPromises()

      expect(wrapper!.findComponent(HistoryPanel).exists()).toBe(false)
      expect(mocks.writeTerminal).not.toHaveBeenCalled()
      expect(mocks.runCommand).not.toHaveBeenCalled()
    })

    it('logs an error if running a command from history fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mocks.runCommand.mockRejectedValueOnce(new Error('inject failed'))
      mountPage()
      emitReady()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      wrapper!.findComponent(HistoryPanel).vm.$emit('run', 'git status')
      await flushPromises()

      expect(errorSpy).toHaveBeenCalledWith('running command from history failed:', expect.any(Error))
      errorSpy.mockRestore()
    })

    it('clears the history list when clearHistory succeeds', async () => {
      mountPage()
      emitReady()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      wrapper!.findComponent(HistoryPanel).vm.$emit('clear')
      await flushPromises()

      expect(mocks.clearHistory).toHaveBeenCalledOnce()
      expect(wrapper!.findComponent(HistoryPanel).props('commands')).toEqual([])
    })

    it('logs an error and keeps existing commands when clearHistory fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mocks.clearHistory.mockRejectedValueOnce(new Error('clear failed'))
      mountPage()
      emitReady()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyH', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      wrapper!.findComponent(HistoryPanel).vm.$emit('clear')
      await flushPromises()

      expect(errorSpy).toHaveBeenCalledWith('clearing history failed:', expect.any(Error))
      expect(wrapper!.findComponent(HistoryPanel).props('commands')).toEqual(['git status', 'ls -la'])
      errorSpy.mockRestore()
    })
  })

  describe('folder shortcut & FolderPanel workflow', () => {
    it('intercepts Ctrl+Shift+F on keydown to resolve CWD and open FolderPanel', async () => {
      mountPage()
      emitReady()

      const keydown = new KeyboardEvent('keydown', {
        code: 'KeyF',
        ctrlKey: true,
        shiftKey: true,
        cancelable: true,
      })
      const allowed = fakeXTerm.keyHandler!(keydown)
      await flushPromises()

      expect(allowed).toBe(false)
      expect(keydown.defaultPrevented).toBe(true)
      expect(mocks.getCwd).toHaveBeenCalledOnce()
      const panel = wrapper!.findComponent(FolderPanel)
      expect(panel.exists()).toBe(true)
      expect(panel.props('rootPath')).toBe('/home/vlad/projects/kutex')
    })

    it('falls back to "." when getCwd rejects or returns an empty string', async () => {
      mocks.getCwd.mockRejectedValueOnce(new Error('cwd error'))
      mountPage()
      emitReady()

      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyF', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      expect(wrapper!.findComponent(FolderPanel).props('rootPath')).toBe('.')
    })

    it('closes the FolderPanel and refocuses the terminal on close event', async () => {
      mountPage()
      emitReady()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyF', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      wrapper!.findComponent(FolderPanel).vm.$emit('close')
      await flushPromises()

      expect(wrapper!.findComponent(FolderPanel).exists()).toBe(false)
      expect(termFocus).toHaveBeenCalledOnce()
    })

    it('clears the current prompt line and runs cd with escaped single quotes on select', async () => {
      mountPage()
      emitReady()
      mocks.captureReset.mockClear()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyF', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      wrapper!.findComponent(FolderPanel).vm.$emit('select', 'dir\'s name')
      await flushPromises()

      expect(wrapper!.findComponent(FolderPanel).exists()).toBe(false)
      expect(termFocus).toHaveBeenCalledOnce()
      expect(mocks.captureReset).toHaveBeenCalledOnce()
      expect(mocks.writeTerminal).toHaveBeenCalledExactlyOnceWith('\x05\x15')
      expect(mocks.runCommand).toHaveBeenCalledExactlyOnceWith('cd -- \'dir\'\\\'\'s name\'')
    })

    it('does not write or run cd if the shell exited while FolderPanel was open', async () => {
      mountPage()
      emitReady()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyF', ctrlKey: true, shiftKey: true }))
      await flushPromises()
      mocks.getExitListener()(0)

      wrapper!.findComponent(FolderPanel).vm.$emit('select', 'src')
      await flushPromises()

      expect(wrapper!.findComponent(FolderPanel).exists()).toBe(false)
      expect(mocks.writeTerminal).not.toHaveBeenCalled()
      expect(mocks.runCommand).not.toHaveBeenCalled()
    })

    it('logs an error if changing directory from FolderPanel fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mocks.runCommand.mockRejectedValueOnce(new Error('cd failed'))
      mountPage()
      emitReady()
      fakeXTerm.keyHandler!(new KeyboardEvent('keydown', { code: 'KeyF', ctrlKey: true, shiftKey: true }))
      await flushPromises()

      wrapper!.findComponent(FolderPanel).vm.$emit('select', 'src')
      await flushPromises()

      expect(errorSpy).toHaveBeenCalledWith('changing directory failed:', expect.any(Error))
      errorSpy.mockRestore()
    })
  })
})
