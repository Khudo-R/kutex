<script lang="ts" setup>
import { computed, nextTick, onMounted, shallowRef, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  /** Recorded commands, most recent first. */
  commands: string[]
}>()

const emit = defineEmits<{
  run: [command: string]
  clear: []
  close: []
}>()

const filterInput = useTemplateRef<HTMLInputElement>('filterInput')
const list = useTemplateRef<HTMLUListElement>('list')

const filter = shallowRef('')
const selected = shallowRef(0)

const filtered = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  return needle ? props.commands.filter(c => c.toLowerCase().includes(needle)) : props.commands
})

watch(filtered, () => (selected.value = 0))

onMounted(() => filterInput.value?.focus())

function move(delta: number) {
  const count = filtered.value.length
  if (count === 0) {
    return
  }
  selected.value = (selected.value + delta + count) % count
  nextTick(() => list.value?.children[selected.value]?.scrollIntoView({ block: 'nearest' }))
}

function run(index = selected.value) {
  const command = filtered.value[index]
  if (command !== undefined) {
    emit('run', command)
  }
}

/** Keyboard shortcuts of the filter input. Each handler runs when its key is pressed. */
const keydownCommands: Record<string, () => void> = {
  ArrowDown: () => move(1),
  ArrowUp: () => move(-1),
  Enter: () => run(),
  Escape: () => emit('close'),
}

function onKeydown(e: KeyboardEvent) {
  const command = keydownCommands[e.key]
  if (!command)
    return

  command()
}
</script>

<template>
  <div class="absolute inset-0 z-10 flex items-start justify-center bg-black/35 pt-[10vh]" @mousedown.self="emit('close')">
    <div
      class="max-h-[60vh] w-[min(640px,90%)] flex flex-col overflow-hidden border border-[#3a4b63] rounded-lg border-solid bg-[#243246] text-left shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
      role="dialog"
      aria-label="Command history"
    >
      <input
        ref="filterInput"
        v-model="filter"
        class="border-0 border-b border-[#3a4b63] border-b-solid bg-transparent px-3 py-2.5 text-inherit outline-none [font:inherit]"
        type="text"
        placeholder="Search command history…"
        spellcheck="false"
        autocomplete="off"
        @keydown.prevent="onKeydown"
      >

      <ul v-if="filtered.length" ref="list" class="m-0 flex-1 list-none overflow-y-auto px-0 py-1" role="listbox">
        <li
          v-for="(command, i) in filtered"
          :key="command"
          class="cursor-pointer truncate px-3 py-1.5 font-mono text-[13px]"
          :class="{ 'bg-[#34507a]': i === selected }"
          role="option"
          :aria-selected="i === selected"
          :title="command"
          @mousemove="selected = i"
          @click="run(i)"
        >
          {{ command }}
        </li>
      </ul>
      <p v-else class="m-0 px-3 py-4 opacity-60">
        {{ commands.length ? 'No matching commands' : 'No commands yet' }}
      </p>

      <footer class="flex items-center justify-between border-t border-[#3a4b63] border-t-solid px-3 py-1.5 text-xs opacity-80">
        <span>↑↓ select · Enter run · Esc close</span>
        <button
          type="button"
          class="cursor-pointer border border-[#3a4b63] rounded border-solid bg-transparent px-2 py-0.5 text-inherit [font:inherit] disabled:cursor-default disabled:opacity-40"
          :disabled="!commands.length"
          @click="emit('clear')"
        >
          Clear history
        </button>
      </footer>
    </div>
  </div>
</template>
