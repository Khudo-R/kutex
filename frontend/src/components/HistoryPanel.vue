<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'

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

const filter = ref('')
const selected = ref(0)

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
  if (!command) return

  command()
}
</script>

<template>
  <div class="history-backdrop" @mousedown.self="emit('close')">
    <div class="history-panel" role="dialog" aria-label="Command history">
      <input
        ref="filterInput"
        v-model="filter"
        class="history-filter"
        type="text"
        placeholder="Search command history…"
        spellcheck="false"
        autocomplete="off"
        @keydown.prevent="onKeydown"
      >

      <ul v-if="filtered.length" ref="list" class="history-list" role="listbox">
        <li
          v-for="(command, i) in filtered"
          :key="command"
          class="history-item"
          :class="{ selected: i === selected }"
          role="option"
          :aria-selected="i === selected"
          :title="command"
          @mousemove="selected = i"
          @click="run(i)"
        >
          {{ command }}
        </li>
      </ul>
      <p v-else class="history-empty">
        {{ commands.length ? 'No matching commands' : 'No commands yet' }}
      </p>

      <footer class="history-footer">
        <span>↑↓ select · Enter run · Esc close</span>
        <button type="button" class="history-clear" :disabled="!commands.length" @click="emit('clear')">
          Clear history
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.history-backdrop {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 10vh;
  background: rgba(0, 0, 0, 0.35);
}

.history-panel {
  display: flex;
  flex-direction: column;
  width: min(640px, 90%);
  max-height: 60vh;
  background: #243246;
  border: 1px solid #3a4b63;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  text-align: left;
}

.history-filter {
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid #3a4b63;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
}

.history-list {
  flex: 1;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  list-style: none;
}

.history-item {
  padding: 6px 12px;
  font-family: Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.history-item.selected {
  background: #34507a;
}

.history-empty {
  margin: 0;
  padding: 16px 12px;
  opacity: 0.6;
}

.history-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-top: 1px solid #3a4b63;
  font-size: 12px;
  opacity: 0.8;
}

.history-clear {
  padding: 2px 8px;
  border: 1px solid #3a4b63;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.history-clear:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
