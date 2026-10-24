import type { Terminal } from '@xterm/xterm'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CommandCapture } from './command-capture'

const PROMPT = '$ '

/**
 * Drives a real (headless) xterm buffer the way TerminalPage.vue does: every keystroke is
 * given to CommandCapture *before* it reaches the shell, and the screen only
 * changes once the "shell" echoes something back.
 */
class FakeShellSession {
  readonly term: HeadlessTerminal
  readonly capture: CommandCapture

  constructor(options: { cols?: number, rows?: number, scrollback?: number } = {}) {
    this.term = new HeadlessTerminal({ cols: 40, rows: 10, allowProposedApi: true, ...options })
    this.capture = new CommandCapture(this.term as unknown as Terminal)
  }

  /** Output printed by the shell (prompt, echo, command output...). */
  print(data: string): Promise<void> {
    return new Promise(resolve => this.term.write(data, resolve))
  }

  /** A keystroke (or pasted chunk) from the user, echoed by the shell as `echo`. */
  async key(data: string, echo = data): Promise<string | undefined> {
    const command = this.capture.input(data)
    await this.print(echo)
    return command
  }

  /** Types `text` one character at a time, each echoed back as-is. */
  async type(text: string): Promise<void> {
    for (const char of text) {
      await this.key(char)
    }
  }

  /** Presses Enter; the shell moves to a new line, prints `output` and a new prompt. */
  enter(output = ''): Promise<string | undefined> {
    return this.key('\r', `\r\n${output}${PROMPT}`)
  }

  dispose() {
    this.term.dispose()
  }
}

describe('commandCapture', () => {
  let session: FakeShellSession

  beforeEach(async () => {
    session = new FakeShellSession()
    await session.print(PROMPT)
  })

  afterEach(() => session.dispose())

  describe('reading the submitted command', () => {
    it('returns the typed command when Enter is pressed', async () => {
      await session.type('ls -la')

      expect(await session.enter()).toBe('ls -la')
    })

    it('returns undefined for keystrokes other than Enter', async () => {
      expect(await session.key('l')).toBeUndefined()
      expect(await session.key('s')).toBeUndefined()
    })

    it('excludes the shell prompt from the command', async () => {
      await session.print('\r\nuser@host:~/projects (main)$ ')
      await session.type('git status')

      expect(await session.enter()).toBe('git status')
    })

    it('trims surrounding whitespace', async () => {
      await session.type('   make build   ')

      expect(await session.enter()).toBe('make build')
    })

    it('returns undefined when Enter is pressed on an empty prompt', async () => {
      expect(await session.enter()).toBeUndefined()
    })

    it('returns undefined when only whitespace was typed', async () => {
      await session.type('    ')

      expect(await session.enter()).toBeUndefined()
    })

    it('captures several commands in a row', async () => {
      await session.type('ls')
      expect(await session.enter('file.txt\r\n')).toBe('ls')

      await session.type('pwd')
      expect(await session.enter('/home/user\r\n')).toBe('pwd')

      await session.type('whoami')
      expect(await session.enter()).toBe('whoami')
    })

    it('forgets the command once it was submitted', async () => {
      await session.type('ls')
      await session.enter()

      expect(await session.enter()).toBeUndefined()
    })
  })

  describe('commands edited by the shell', () => {
    it('captures Tab completions done by the shell', async () => {
      await session.type('git st')
      await session.key('\t', 'atus ')

      expect(await session.enter()).toBe('git status')
    })

    it('captures commands recalled from shell history with the Up arrow', async () => {
      await session.key('\x1B[A', 'docker compose up -d')

      expect(await session.enter()).toBe('docker compose up -d')
    })

    it('captures corrections made with Backspace', async () => {
      await session.type('gti')
      await session.key('\x7F', '\b \b')
      await session.key('\x7F', '\b \b')
      await session.type('it')

      expect(await session.enter()).toBe('git')
    })

    it('captures the line after the shell redraws it (Ctrl+U)', async () => {
      await session.type('rm -rf build')
      await session.key('\x15', `\r${PROMPT}\x1B[K`)
      await session.type('pwd')

      expect(await session.enter()).toBe('pwd')
    })
  })

  describe('long commands', () => {
    beforeEach(async () => {
      session.dispose()
      session = new FakeShellSession({ cols: 10, rows: 10 })
      await session.print(PROMPT)
    })

    it('joins commands wrapped over several rows', async () => {
      const command = `echo ${'a'.repeat(30)}`
      await session.type(command)

      expect(await session.enter()).toBe(command)
    })

    it('keeps a space that falls on the last column before a wrap', async () => {
      // "$ " + "echo ab " fills the 10 columns exactly: the space is the last cell.
      await session.type('echo ab cd')

      expect(await session.enter()).toBe('echo ab cd')
    })
  })

  describe('scrolling', () => {
    it('follows the command when the screen scrolls while typing', async () => {
      session.dispose()
      session = new FakeShellSession({ cols: 20, rows: 3 })
      await session.print(`line 1\r\nline 2\r\n${PROMPT}`)

      const command = `echo ${'x'.repeat(30)}`
      await session.type(command)

      expect(await session.enter()).toBe(command)
    })

    it('returns undefined when the start of the command scrolled out of the buffer', async () => {
      session.dispose()
      session = new FakeShellSession({ cols: 20, rows: 3, scrollback: 0 })
      await session.print(PROMPT)

      await session.type('abc')
      await session.print('\r\nbackground job output'.repeat(5))

      expect(await session.enter()).toBeUndefined()
    })

    it('returns undefined if the buffer line at the marker is unavailable', async () => {
      await session.type('ls')
      const activeBuffer = session.term.buffer.active
      const getLineSpy = Object.assign(activeBuffer.getLine.bind(activeBuffer), {})
      Object.defineProperty(activeBuffer, 'getLine', {
        configurable: true,
        value: () => undefined,
      })

      expect(await session.enter()).toBeUndefined()

      Object.defineProperty(activeBuffer, 'getLine', {
        configurable: true,
        value: getLineSpy,
      })
    })

    it('captures the next command after the start scrolled out of the buffer', async () => {
      session.dispose()
      session = new FakeShellSession({ cols: 20, rows: 3, scrollback: 0 })
      await session.print(PROMPT)

      await session.type('abc')
      await session.print('\r\nbackground job output'.repeat(5))
      await session.enter()
      await session.type('ls')

      expect(await session.enter()).toBe('ls')
    })
  })

  describe('interrupted and multi-line input', () => {
    it('discards the line when Ctrl+C is pressed', async () => {
      await session.type('sleep 100')
      expect(await session.key('\x03', `^C\r\n${PROMPT}`)).toBeUndefined()

      await session.type('ls')

      expect(await session.enter()).toBe('ls')
    })

    it('discards the line when Ctrl+C is part of a larger chunk', async () => {
      await session.type('sleep 100')
      expect(await session.key('x\x03', `x^C\r\n${PROMPT}`)).toBeUndefined()

      await session.type('pwd')

      expect(await session.enter()).toBe('pwd')
    })

    it('ignores an unbracketed multi-line paste and starts over', async () => {
      const pasted = await session.key('echo a\recho b\r', `echo a\r\na\r\n${PROMPT}echo b\r\nb\r\n${PROMPT}`)
      expect(pasted).toBeUndefined()

      await session.type('pwd')

      expect(await session.enter()).toBe('pwd')
    })

    it('captures a single-line bracketed paste', async () => {
      await session.key('\x1B[200~git status\x1B[201~', 'git status')

      expect(await session.enter()).toBe('git status')
    })

    it('keeps tracking the line through a bracketed paste containing newlines', async () => {
      const pasted = await session.key('\x1B[200~echo one\recho two\x1B[201~', 'echo one\r\n> echo two')
      expect(pasted).toBeUndefined()

      // Only the first row is part of the (unwrapped) command line.
      expect(await session.enter()).toBe('echo one')
    })
  })

  describe('full-screen programs (alternate buffer)', () => {
    it('never records Enter presses inside vim, less, htop...', async () => {
      await session.type('vim notes.txt')
      expect(await session.enter()).toBe('vim notes.txt')

      await session.print('\x1B[?1049h')

      expect(await session.key('i')).toBeUndefined()
      await session.type('hello')
      expect(await session.key('\r', '\r\n')).toBeUndefined()
      expect(await session.key('\x1B', '')).toBeUndefined()
      expect(await session.key(':')).toBeUndefined()
      await session.type('wq')
      expect(await session.key('\r', '')).toBeUndefined()
    })

    it('captures commands again once the program exits', async () => {
      await session.type('less log.txt')
      await session.enter()

      await session.print('\x1B[?1049h')
      await session.type('jjjq')
      await session.print(`\x1B[?1049l\r\n${PROMPT}`)

      await session.type('ls')

      expect(await session.enter()).toBe('ls')
    })

    it('forgets a line that was being typed when the alternate buffer opened', async () => {
      await session.type('half typed')
      await session.print('\x1B[?1049h')
      await session.key('q')
      await session.print(`\x1B[?1049l\r\n${PROMPT}`)

      await session.type('pwd')

      expect(await session.enter()).toBe('pwd')
    })
  })

  describe('reset', () => {
    it('forgets where the current command started', async () => {
      await session.type('abc')
      session.capture.reset()
      await session.type('de')

      // The next keystroke after reset() marks a new start position.
      expect(await session.enter()).toBe('de')
    })

    it('makes Enter return undefined when nothing was typed after it', async () => {
      await session.type('ls')
      session.capture.reset()

      expect(await session.enter()).toBeUndefined()
    })

    it('is safe to call repeatedly or before anything was typed', () => {
      expect(() => {
        session.capture.reset()
        session.capture.reset()
      }).not.toThrow()
    })
  })
})
