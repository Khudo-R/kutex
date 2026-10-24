<script lang="ts" setup>
import type { Terminal } from '@xterm/xterm'
import { onBeforeUnmount, ref, shallowRef, useTemplateRef } from 'vue'
import {
  onTerminalExit,
  onTerminalOutput,
  resizeTerminal,
  runCommand,
  startTerminal,
  writeTerminal,
  XTerminal,
} from '@/entities/terminal'
import {
  addHistory,
  clearHistory as clearHistoryApi,
  CommandCapture,
  getHistory,
  HistoryPanel,
} from '@/features/command-history'
import { safePromiseTyped } from '@/shared/lib/safe-promise'

const terminal = useTemplateRef<InstanceType<typeof XTerminal>>('terminal')

const ENTER = '\r'
/** Ctrl+E (end of line) then Ctrl+U (kill line): clears a half-typed line in bash and zsh. */
const CLEAR_LINE = '\x05\x15'

/** True after the shell exited (e.g. the user typed `exit`), until it is restarted. */
let exited = false

let capture: CommandCapture | undefined

const historyOpen = shallowRef(false)
const historyCommands = ref<string[]>([])

// Subscribe during setup, before XTerminal mounts and starts the shell,
// so no early output (like the first prompt) is missed.
const unsubscribe = [
  onTerminalOutput((bytes: Uint8Array) => terminal.value?.write(bytes)),
  onTerminalExit((code: number) => {
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
  if (!isHistoryShortcut)
    return true

  if (e.type === 'keydown') {
    e.preventDefault()
    openHistory()
  }
  return false
}

function startShell(cols: number, rows: number) {
  exited = false
  capture?.reset()
  startTerminal(cols, rows).catch((err: unknown) => {
    exited = true
    terminal.value?.writeln(`\x1B[1;31mFailed to start shell: ${err}\x1B[0m`)
  })
}

function onData(data: string) {
  if (!exited) {
    const command = capture?.input(data)
    if (command) {
      addHistory(command).catch((err: unknown) => console.error('recording history failed:', err))
    }
    writeTerminal(data).catch((err: unknown) => console.error('terminal write failed:', err))
    return
  }
  if (data === ENTER) {
    const term = terminal.value?.term
    terminal.value?.clear()
    startShell(term?.cols ?? 80, term?.rows ?? 24)
  }
}

function onResize({ cols, rows }: { cols: number, rows: number }) {
  resizeTerminal(cols, rows).catch((err: unknown) => console.error('terminal resize failed:', err))
}

async function openHistory() {
  const [err, data] = await safePromiseTyped(getHistory())
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
  if (exited)
    return

  capture?.reset()
  const [err] = await safePromiseTyped(Promise.all([writeTerminal(CLEAR_LINE), runCommand(command)]))
  if (err) {
    console.error('running command from history failed:', err)
  }
}

async function clearHistory() {
  const [err] = await safePromiseTyped(clearHistoryApi())
  if (err) {
    console.error('clearing history failed:', err)
    return
  }
  historyCommands.value = []
}
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
