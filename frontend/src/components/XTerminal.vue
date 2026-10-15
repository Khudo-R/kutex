<script lang="ts" setup>
import type { ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { loadNerdFont, withNerdFont } from '@/fonts/nerd-font'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  options?: ITerminalOptions
}>()

const emit = defineEmits<{
  data: [data: string]
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
  try {
    fitAddon.fit()
  }
  catch {}
}

/**
 * Switches to the WebGL renderer. Unlike the default DOM renderer, it draws
 * Powerline separators and box-drawing characters itself (`customGlyphs`), so
 * they always fill the whole cell whatever the font size or window size.
 * Falls back to the DOM renderer if WebGL is unavailable or its context is lost.
 */
function loadWebgl(t: Terminal) {
  try {
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => webgl.dispose())
    t.loadAddon(webgl)
  }
  catch (err) {
    console.warn('WebGL renderer unavailable, using DOM renderer:', err)
  }
}

onMounted(() => {
  const options: ITerminalOptions = {
    cursorBlink: true,
    customGlyphs: true,
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
  loadWebgl(t)
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
