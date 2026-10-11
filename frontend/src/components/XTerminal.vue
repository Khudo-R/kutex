<script lang="ts" setup>
import type { ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { loadNerdFont, withNerdFont } from '@/fonts/nerd-font'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  options?: ITerminalOptions
}>()

const emit = defineEmits<{
  /** Raw user input (keystrokes, paste) — forward this to your PTY/backend. */
  data: [data: string]
  /** Fired whenever the terminal grid size changes — forward to PTY resize. */
  resize: [size: { cols: number, rows: number }]
  ready: [term: Terminal]
}>()

const DEFAULT_FONT_FAMILY = 'Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace'

// Start fetching early so icons are ready by the time the shell prints its prompt.
loadNerdFont()

const container = useTemplateRef<HTMLDivElement>('container')
const term = shallowRef<Terminal>()
const fitAddon = new FitAddon()
let resizeObserver: ResizeObserver | undefined

function fit() {
  // fit() throws if the element is hidden / has no size yet
  try {
    fitAddon.fit()
  }
  catch {}
}

onMounted(() => {
  const options: ITerminalOptions = {
    cursorBlink: true,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: 14,
    theme: { background: '#1b2636' },
    ...props.options,
  }
  // Nerd Font icons work whatever font is configured.
  options.fontFamily = withNerdFont(options.fontFamily ?? DEFAULT_FONT_FAMILY)

  const t = new Terminal(options)
  t.loadAddon(fitAddon)
  t.loadAddon(new WebLinksAddon())
  t.open(container.value!)
  fit()

  // Icons printed before the font finished loading were drawn as boxes: redraw them.
  loadNerdFont().then(() => {
    if (term.value !== t) {
      return // unmounted meanwhile
    }
    t.clearTextureAtlas()
    t.refresh(0, t.rows - 1)
  })

  t.onData(d => emit('data', d))
  t.onResize(size => emit('resize', size))

  resizeObserver = new ResizeObserver(() => requestAnimationFrame(fit))
  resizeObserver.observe(container.value!)

  term.value = t
  emit('ready', t)
  t.focus()

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    term.value?.dispose()
  })
})

defineExpose({
  write: (data: string | Uint8Array) => term.value?.write(data),
  writeln: (data: string) => term.value?.writeln(data),
  clear: () => term.value?.clear(),
  focus: () => term.value?.focus(),
  fit,
  term,
})
</script>

<template>
  <div ref="container" class="xterminal" />
</template>

<style scoped>
.xterminal {
  width: 100%;
  height: 100%;
  overflow: hidden;
  text-align: left;
}
</style>
