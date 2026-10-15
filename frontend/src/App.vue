<script lang="ts" setup>
import type { Terminal } from '@xterm/xterm'
import { onBeforeUnmount, useTemplateRef } from 'vue'
import { ExecuteCommand, GetCwd, Resize, RunCommand, Start, Write } from '../wailsjs/go/terminal/Terminal'
import { EventsOn } from '../wailsjs/runtime/runtime'
import XTerminal from './components/XTerminal.vue'

// Expose programmatic command methods on window.kutex
if (typeof window !== 'undefined') {
  ;(window as unknown as { kutex?: Record<string, unknown> }).kutex = {
    executeCommand: ExecuteCommand,
    runCommand: RunCommand,
    getCwd: GetCwd,
  }
}

// The real shell runs in Go (see terminal.go) inside a PTY. This component only
// forwards keystrokes to it and renders whatever it prints. The shell itself
// handles echo, line editing, history, Ctrl+C, `cd`, `ls`, colors, etc.

const terminal = useTemplateRef<InstanceType<typeof XTerminal>>('terminal')

/** Must match the event names in terminal.go. */
const Event = {
  Output: 'terminal:output',
  Exit: 'terminal:exit',
} as const

const ENTER = '\r'

/** True after the shell exited (e.g. the user typed `exit`), until it is restarted. */
let exited = false

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
  startShell(term.cols, term.rows)
}

function startShell(cols: number, rows: number) {
  exited = false
  Start(cols, rows).catch((err: unknown) => {
    exited = true
    terminal.value?.writeln(`\x1B[1;31mFailed to start shell: ${err}\x1B[0m`)
  })
}

function onData(data: string) {
  if (!exited) {
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

/** Go sends raw PTY bytes as base64; xterm decodes UTF-8 itself, even across chunks. */
function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
</script>

<template>
  <main id="app">
    <XTerminal ref="terminal" @ready="onReady" @data="onData" @resize="onResize" />
  </main>
</template>

<style scoped>
#app {
  height: 100vh;
  padding: 8px;
  box-sizing: border-box;
}
</style>
