<script lang="ts" setup>
import type { Terminal } from '@xterm/xterm'
import { onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { AddHistory, ClearHistory, ExecuteCommand, GetCwd, GetHistory, Resize, RunCommand, Start, Write } from '../wailsjs/go/terminal/Terminal'
import { EventsOn } from '../wailsjs/runtime/runtime'
import HistoryPanel from './components/HistoryPanel.vue'
import XTerminal from './components/XTerminal.vue'
import { CommandCapture } from './terminal/command-capture'
import { safePromiseTyped } from '@/shared/utils'

// Expose programmatic command methods on window.kutex
if (typeof window !== 'undefined') {
  ;(window as unknown as { kutex?: Record<string, unknown> }).kutex = {
    executeCommand: ExecuteCommand,
    runCommand: RunCommand,
    getCwd: GetCwd,
    getHistory: GetHistory,
    clearHistory: ClearHistory,
  }
}

// The real shell runs in Go (see terminal.go) inside a PTY. This component only
// forwards keystrokes to it and renders whatever it prints. The shell itself
// handles echo, line editing, history, Ctrl+C, `cd`, `ls`, colors, etc.
//
// On top of that, Kutex keeps its own command history (see history.go): typed
// commands are captured on Enter, and Ctrl+Shift+H opens a panel to re-run them.

const terminal = useTemplateRef<InstanceType<typeof XTerminal>>('terminal')

/** Must match the event names in terminal.go. */
const Event = {
  Output: 'terminal:output',
  Exit: 'terminal:exit',
} as const

const ENTER = '\r'
/** Ctrl+E (end of line) then Ctrl+U (kill line): clears a half-typed line in bash and zsh. */
const CLEAR_LINE = '\x05\x15'

/** True after the shell exited (e.g. the user typed `exit`), until it is restarted. */
let exited = false

let capture: CommandCapture | undefined

const historyOpen = ref(false)
const historyCommands = ref<string[]>([])

// Subscribe during setup, before XTerminal mounts and starts the shell,
// so no early output (like the first prompt) is missed.
const unsubscribe = [
  EventsOn(Event.Output, (chunk: string) => terminal.value?.write(decodeBase64(chunk))),
  EventsOn(Event.Exit, (code: number) => {
    exited = true
    terminal.value?.writeln(`\r\n\x1B[2m[process exited with code ${code}, press Enter to restart]\x1B[0m`)
  }),
]

onBeforeUnmount(() => unsubscribe.forEach(off => off()))

function onReady(term: Terminal) {
  capture = new CommandCapture(term)
  term.attachCustomKeyEventHandler(onKey)
  startShell(term.cols, term.rows)
}

/** Intercepts app shortcuts before xterm turns them into shell input. */
function onKey(e: KeyboardEvent): boolean {
  const isHistoryShortcut = e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyH'
  if (!isHistoryShortcut) return true

  if (e.type === 'keydown') {
    e.preventDefault()
    openHistory()
  }
  return false
}

function startShell(cols: number, rows: number) {
  exited = false
  capture?.reset()
  Start(cols, rows).catch((err: unknown) => {
    exited = true
    terminal.value?.writeln(`\x1B[1;31mFailed to start shell: ${err}\x1B[0m`)
  })
}

function onData(data: string) {
  if (!exited) {
    const command = capture?.input(data)
    if (command) {
      AddHistory(command).catch((err: unknown) => console.error('recording history failed:', err))
    }
    Write(data).catch((err: unknown) => console.error('terminal write failed:', err))
    return
  }
  if (data === ENTER) {
    const term = terminal.value?.term
    terminal.value?.clear()
    startShell(term?.cols ?? 80, term?.rows ?? 24)
  }
}

function onResize({ cols, rows }: { cols: number, rows: number }) {
  Resize(cols, rows).catch((err: unknown) => console.error('terminal resize failed:', err))
}

async function openHistory() {
  const [err, data] = await safePromiseTyped(GetHistory())
  if (err || data === undefined) {
    console.error('loading history failed:', err)
    historyOpen.value = false
    return
  }
  historyCommands.value = data
  historyOpen.value = true
}

function closeHistory() {
  historyOpen.value = false
  terminal.value?.focus()
}

/** Re-runs a command from the history panel, replacing whatever was half-typed. */
async function runFromHistory(command: string) {
  closeHistory()
  if (exited) return

  capture?.reset()
  const [err] = await safePromiseTyped(Promise.all([Write(CLEAR_LINE), RunCommand(command)]))
  if (err) {
    console.error('running command from history failed:', err)
  }
}

async function clearHistory() {
  const [err] = await safePromiseTyped(ClearHistory())
  if (err) {
    console.error('clearing history failed:', err)
    return
  }
  historyCommands.value = []
}

/** Go sends raw PTY bytes as base64; xterm decodes UTF-8 itself, even across chunks. */
const decodeBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
</script>

<template>
  <main id="app" class="relative box-border h-screen p-2">
    <XTerminal ref="terminal" @ready="onReady" @data="onData" @resize="onResize" />
    <HistoryPanel
      v-if="historyOpen"
      :commands="historyCommands"
      @run="runFromHistory"
      @clear="clearHistory"
      @close="closeHistory"
    />
  </main>
</template>
