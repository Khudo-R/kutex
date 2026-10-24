import type { VueWrapper } from '@vue/test-utils'
import type { ITerminalOptions } from '@xterm/xterm'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import XTerminal from './XTerminal.vue'

type Listener<T> = (value: T) => void

const mocks = vi.hoisted(() => {
  class FakeTerminal {
    static instances: FakeTerminal[] = []
    cols = 80
    rows = 24
    dataListener?: Listener<string>
    resizeListener?: Listener<{ cols: number, rows: number }>
    loadAddon = vi.fn()
    open = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    write = vi.fn()
    writeln = vi.fn()
    clear = vi.fn()
    clearTextureAtlas = vi.fn()
    refresh = vi.fn()
    onData = vi.fn((listener: Listener<string>) => {
      this.dataListener = listener
      return { dispose: vi.fn() }
    })

    onResize = vi.fn((listener: Listener<{ cols: number, rows: number }>) => {
      this.resizeListener = listener
      return { dispose: vi.fn() }
    })

    constructor(readonly options: ITerminalOptions) {
      FakeTerminal.instances.push(this)
    }
  }

  class FakeFitAddon {
    static instances: FakeFitAddon[] = []
    fit = vi.fn()
    constructor() {
      FakeFitAddon.instances.push(this)
    }
  }

  class FakeWebLinksAddon {
    static instances: FakeWebLinksAddon[] = []
    constructor() {
      FakeWebLinksAddon.instances.push(this)
    }
  }

  class FakeWebglAddon {
    static instances: FakeWebglAddon[] = []
    static failWith: Error | undefined
    contextLossListener?: () => void
    dispose = vi.fn()
    onContextLoss = vi.fn((listener: () => void) => {
      this.contextLossListener = listener
      return { dispose: vi.fn() }
    })

    constructor() {
      if (FakeWebglAddon.failWith) {
        throw FakeWebglAddon.failWith
      }
      FakeWebglAddon.instances.push(this)
    }
  }

  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = []
    observe = vi.fn()
    disconnect = vi.fn()
    constructor(readonly callback: () => void) {
      FakeResizeObserver.instances.push(this)
    }
  }

  const font: { resolve: () => void, promise: Promise<void> } = { resolve: () => {}, promise: Promise.resolve() }
  const loadNerdFont = vi.fn(() => font.promise)

  return { FakeTerminal, FakeFitAddon, FakeWebLinksAddon, FakeWebglAddon, FakeResizeObserver, font, loadNerdFont }
})

vi.mock('@xterm/xterm', () => ({ Terminal: mocks.FakeTerminal }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: mocks.FakeFitAddon }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: mocks.FakeWebLinksAddon }))
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: mocks.FakeWebglAddon }))
vi.mock('@/shared/lib/nerd-font', async importOriginal => ({
  ...await importOriginal<typeof import('@/shared/lib/nerd-font')>(),
  loadNerdFont: mocks.loadNerdFont,
}))

interface XTerminalApi {
  write: (data: string | Uint8Array) => void
  writeln: (data: string) => void
  clear: () => void
  focus: () => void
  fit: () => void
  term: unknown
}

const DEFAULT_FONT_WITH_ICONS = 'Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", "Symbols Nerd Font Mono", monospace'

describe('xTerminal', () => {
  let wrapper: VueWrapper | undefined

  function mountTerminal(options?: ITerminalOptions) {
    wrapper = mount(XTerminal, { props: { options } })
    return wrapper
  }

  const terminal = () => mocks.FakeTerminal.instances.at(-1)!
  const fitAddon = () => mocks.FakeFitAddon.instances.at(-1)!
  const webglAddon = () => mocks.FakeWebglAddon.instances.at(-1)!
  const resizeObserver = () => mocks.FakeResizeObserver.instances.at(-1)!
  const api = () => wrapper!.vm as unknown as XTerminalApi

  /** Makes the next loadNerdFont() call pending until `mocks.font.resolve()`. */
  function deferFontLoading() {
    mocks.font.promise = new Promise((resolve) => {
      mocks.font.resolve = resolve
    })
  }

  beforeEach(() => {
    mocks.FakeTerminal.instances = []
    mocks.FakeFitAddon.instances = []
    mocks.FakeWebLinksAddon.instances = []
    mocks.FakeWebglAddon.instances = []
    mocks.FakeWebglAddon.failWith = undefined
    mocks.FakeResizeObserver.instances = []
    mocks.font.promise = Promise.resolve()
    vi.stubGlobal('ResizeObserver', mocks.FakeResizeObserver)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  describe('setup', () => {
    it('renders a container that fills its parent', () => {
      mountTerminal()

      expect(wrapper!.element.tagName).toBe('DIV')
      expect(wrapper!.classes()).toEqual(expect.arrayContaining(['h-full', 'w-full', 'overflow-hidden']))
    })

    it('creates the terminal with the default options and Nerd Font icons', () => {
      mountTerminal()

      expect(terminal().options).toEqual({
        cursorBlink: true,
        customGlyphs: true,
        fontFamily: DEFAULT_FONT_WITH_ICONS,
        fontSize: 14,
        theme: { background: '#1b2636' },
      })
    })

    it('lets the options prop override the defaults', () => {
      mountTerminal({ fontSize: 18, cursorBlink: false, theme: { background: '#000000' } })

      expect(terminal().options).toEqual({
        cursorBlink: false,
        customGlyphs: true,
        fontFamily: DEFAULT_FONT_WITH_ICONS,
        fontSize: 18,
        theme: { background: '#000000' },
      })
    })

    it('adds the Nerd Font fallback to a custom font family', () => {
      mountTerminal({ fontFamily: '"Fira Code", monospace' })

      expect(terminal().options.fontFamily).toBe('"Fira Code", "Symbols Nerd Font Mono", monospace')
    })

    it('falls back to the default font family when the prop sets it to undefined', () => {
      mountTerminal({ fontFamily: undefined })

      expect(terminal().options.fontFamily).toBe(DEFAULT_FONT_WITH_ICONS)
    })

    it('opens the terminal inside its container', () => {
      mountTerminal()

      expect(terminal().open).toHaveBeenCalledExactlyOnceWith(wrapper!.element)
    })

    it('loads the fit, web links and WebGL addons', () => {
      mountTerminal()

      expect(terminal().loadAddon).toHaveBeenCalledTimes(3)
      expect(terminal().loadAddon).toHaveBeenCalledWith(fitAddon())
      expect(terminal().loadAddon).toHaveBeenCalledWith(mocks.FakeWebLinksAddon.instances[0])
      expect(terminal().loadAddon).toHaveBeenCalledWith(webglAddon())
    })

    it('loads the WebGL renderer after the terminal is opened', () => {
      mountTerminal()

      const webglLoadOrder = terminal().loadAddon.mock.invocationCallOrder[
        terminal().loadAddon.mock.calls.findIndex(([addon]) => addon === webglAddon())
      ]!
      expect(terminal().open.mock.invocationCallOrder[0]).toBeLessThan(webglLoadOrder)
    })

    it('fits the terminal to its container', () => {
      mountTerminal()

      expect(fitAddon().fit).toHaveBeenCalled()
    })

    it('focuses the terminal', () => {
      mountTerminal()

      expect(terminal().focus).toHaveBeenCalledOnce()
    })

    it('emits ready with the terminal instance', () => {
      mountTerminal()

      expect(wrapper!.emitted('ready')).toEqual([[terminal()]])
    })

    it('starts loading the Nerd Font', () => {
      mountTerminal()

      expect(mocks.loadNerdFont).toHaveBeenCalled()
    })

    it('ignores errors thrown while fitting (e.g. hidden container)', () => {
      expect(() => {
        mountTerminal()
        fitAddon().fit.mockImplementation(() => {
          throw new Error('container has no size')
        })
        api().fit()
        resizeObserver().callback()
      }).not.toThrow()
    })
  })

  describe('webGL renderer', () => {
    it('falls back to the DOM renderer when WebGL is unavailable', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const error = new Error('WebGL2 not supported')
      mocks.FakeWebglAddon.failWith = error

      mountTerminal()

      expect(warn).toHaveBeenCalledWith('WebGL renderer unavailable, using DOM renderer:', error)
      expect(terminal().loadAddon).toHaveBeenCalledTimes(2)
      expect(wrapper!.emitted('ready')).toHaveLength(1)
      warn.mockRestore()
    })

    it('disposes the WebGL addon when its GPU context is lost', () => {
      mountTerminal()
      expect(webglAddon().dispose).not.toHaveBeenCalled()

      webglAddon().contextLossListener!()

      expect(webglAddon().dispose).toHaveBeenCalledOnce()
    })
  })

  describe('events', () => {
    it('emits data for user input', () => {
      mountTerminal()

      terminal().dataListener!('ls\r')

      expect(wrapper!.emitted('data')).toEqual([['ls\r']])
    })

    it('emits resize when the terminal grid changes size', () => {
      mountTerminal()

      terminal().resizeListener!({ cols: 120, rows: 40 })

      expect(wrapper!.emitted('resize')).toEqual([[{ cols: 120, rows: 40 }]])
    })
  })

  describe('container resizing', () => {
    it('observes the container element', () => {
      mountTerminal()

      expect(resizeObserver().observe).toHaveBeenCalledExactlyOnceWith(wrapper!.element)
    })

    it('refits the terminal on the next animation frame when the container resizes', () => {
      const frames: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
      mountTerminal()
      fitAddon().fit.mockClear()

      resizeObserver().callback()
      expect(fitAddon().fit).not.toHaveBeenCalled()

      frames.forEach(frame => frame(0))
      expect(fitAddon().fit).toHaveBeenCalledOnce()
    })
  })

  describe('nerd Font redraw', () => {
    it('redraws the whole screen once the Nerd Font is loaded', async () => {
      deferFontLoading()
      terminalRows(30)
      mountTerminal()
      expect(terminal().refresh).not.toHaveBeenCalled()

      mocks.font.resolve()
      await vi.waitFor(() => expect(terminal().refresh).toHaveBeenCalled())

      expect(terminal().clearTextureAtlas).toHaveBeenCalledOnce()
      expect(terminal().refresh).toHaveBeenCalledExactlyOnceWith(0, 29)
    })

    it('does not touch the terminal if it was unmounted before the font loaded', async () => {
      deferFontLoading()
      mountTerminal()
      const term = terminal()
      wrapper!.unmount()
      wrapper = undefined

      mocks.font.resolve()
      await mocks.font.promise
      await Promise.resolve()

      expect(term.clearTextureAtlas).not.toHaveBeenCalled()
      expect(term.refresh).not.toHaveBeenCalled()
    })
  })

  describe('exposed API', () => {
    it('writes text and raw bytes to the terminal', () => {
      mountTerminal()
      const bytes = new Uint8Array([0xE2, 0x9C, 0x93])

      api().write('hello')
      api().write(bytes)

      expect(terminal().write).toHaveBeenNthCalledWith(1, 'hello')
      expect(terminal().write).toHaveBeenNthCalledWith(2, bytes)
    })

    it('writes lines to the terminal', () => {
      mountTerminal()

      api().writeln('[process exited]')

      expect(terminal().writeln).toHaveBeenCalledExactlyOnceWith('[process exited]')
    })

    it('clears the terminal', () => {
      mountTerminal()

      api().clear()

      expect(terminal().clear).toHaveBeenCalledOnce()
    })

    it('focuses the terminal', () => {
      mountTerminal()
      terminal().focus.mockClear()

      api().focus()

      expect(terminal().focus).toHaveBeenCalledOnce()
    })

    it('refits the terminal', () => {
      mountTerminal()
      fitAddon().fit.mockClear()

      api().fit()

      expect(fitAddon().fit).toHaveBeenCalledOnce()
    })

    it('exposes the xterm instance', () => {
      mountTerminal()

      expect(api().term).toBe(terminal())
    })
  })

  describe('unmounting', () => {
    it('stops observing the container and disposes the terminal', () => {
      mountTerminal()
      const term = terminal()
      const observer = resizeObserver()

      wrapper!.unmount()
      wrapper = undefined

      expect(observer.disconnect).toHaveBeenCalledOnce()
      expect(term.dispose).toHaveBeenCalledOnce()
    })
  })
})

/** Sets the row count of terminals created from now on. */
function terminalRows(rows: number) {
  const original = mocks.FakeTerminal.prototype
  vi.spyOn(mocks.FakeTerminal.instances, 'push').mockImplementation((...terms) => {
    terms.forEach(term => (term.rows = rows))
    return Array.prototype.push.apply(mocks.FakeTerminal.instances, terms)
  })
  return original
}
