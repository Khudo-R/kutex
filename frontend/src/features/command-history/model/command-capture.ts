import type { IMarker, Terminal } from '@xterm/xterm'

const ENTER = '\r'
const CTRL_C = '\x03'
const BRACKETED_PASTE_START = '\x1B[200~'

/**
 * Works out which command the user typed in the terminal, so Kutex can keep its
 * own history independent of the shell.
 *
 * The shell does all the line editing (Tab completion, Up/Down recall, Ctrl+W...),
 * so the keystrokes alone don't say what the final command is. Instead, the
 * cursor position at the first keystroke after a prompt marks where the command
 * starts, and the command is read back from the screen when Enter is pressed.
 */
export class CommandCapture {
  /** Where the command being typed starts, if the user started typing. */
  private start?: { marker: IMarker, col: number }

  constructor(private readonly term: Terminal) {}

  /**
   * Must be called with each chunk of user input *before* it is sent to the shell.
   * Returns the command line when the input submits one (Enter), otherwise undefined.
   */
  input(data: string): string | undefined {
    const buffer = this.term.buffer.active

    // Full-screen programs (vim, less, htop...) use the alternate buffer: Enter there isn't a command.
    if (buffer.type === 'alternate') {
      this.reset()
      return undefined
    }

    if (data === ENTER) {
      const command = this.read()
      this.reset()
      return command || undefined
    }

    // Ctrl+C discards the line. A multi-line chunk that isn't a bracketed paste
    // runs lines we can't read back reliably, so just start over.
    if (data.includes(CTRL_C) || (data.includes(ENTER) && !data.includes(BRACKETED_PASTE_START))) {
      this.reset()
      return undefined
    }

    if (!this.start) {
      this.start = { marker: this.term.registerMarker(0), col: buffer.cursorX }
    }
    return undefined
  }

  /** Forgets the current command line, e.g. after the shell restarted or a command was injected. */
  reset() {
    this.start?.marker.dispose()
    this.start = undefined
  }

  /** Reads the command from the start position up to the end of the (possibly wrapped) line. */
  private read(): string {
    const start = this.start
    if (!start || start.marker.isDisposed || start.marker.line < 0) {
      return ''
    }

    const buffer = this.term.buffer.active
    let row = start.marker.line
    let text = buffer.getLine(row)?.translateToString(false, start.col) ?? ''
    for (let line = buffer.getLine(++row); line?.isWrapped; line = buffer.getLine(++row)) {
      text += line.translateToString(false)
    }
    return text.trim()
  }
}
