<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { kutexGlyphWhite } from '@/shared/assets/icons'
import { safePromiseTyped } from '@/shared/lib/safe-promise'
import { getFolders, getFoldersRecursive } from '../api/system-api'

const { rootPath = '.' } = defineProps<{
  /** Base directory path to inspect (`"."` by default). */
  rootPath?: string
}>()

const emit = defineEmits<{
  select: [folder: string]
  close: []
}>()

const filterInput = useTemplateRef<HTMLInputElement>('filterInput')
const list = useTemplateRef<HTMLUListElement>('list')

const filter = shallowRef('')
const recursive = shallowRef(false)
const folders = ref<string[]>([])
const loading = shallowRef(false)
const errorMessage = shallowRef<string | undefined>(undefined)
const selected = shallowRef(0)

let latestRequest = 0

const filtered = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  return needle ? folders.value.filter(f => f.toLowerCase().includes(needle)) : folders.value
})

watch(filtered, () => (selected.value = 0))

async function loadFolders() {
  const requestId = ++latestRequest
  loading.value = true
  errorMessage.value = undefined

  const call: Promise<string[] | null> = recursive.value ? getFoldersRecursive(rootPath) : getFolders(rootPath)
  const [err, data] = await safePromiseTyped(call)

  if (requestId !== latestRequest)
    return

  loading.value = false
  if (err) {
    errorMessage.value = err.message
    folders.value = []
    return
  }

  folders.value = data ?? []
}

watch([() => rootPath, recursive], loadFolders, { immediate: true })

onMounted(() => filterInput.value?.focus())

function toggleRecursive() {
  recursive.value = !recursive.value
  filterInput.value?.focus()
}

function move(delta: number) {
  const count = filtered.value.length
  if (count === 0)
    return

  selected.value = (selected.value + delta + count) % count
  nextTick(() => list.value?.children[selected.value]?.scrollIntoView({ block: 'nearest' }))
}

function selectFolder(index = selected.value) {
  const folder = filtered.value[index]
  if (folder !== undefined) {
    emit('select', folder)
  }
}

const keydownCommands: Record<string, () => void> = {
  ArrowDown: () => move(1),
  ArrowUp: () => move(-1),
  Enter: () => selectFolder(),
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
      aria-label="Folder navigator"
    >
      <div class="flex items-center gap-2.5 border-b border-[#3a4b63] border-b-solid px-3">
        <img :src="kutexGlyphWhite" alt="Kutex" class="h-4 w-4 shrink-0 select-none opacity-85">
        <input
          ref="filterInput"
          v-model="filter"
          class="w-full border-0 bg-transparent py-2.5 text-inherit outline-none [font:inherit]"
          type="text"
          placeholder="Search folders…"
          spellcheck="false"
          autocomplete="off"
          @keydown.prevent="onKeydown"
        >
        <span class="max-w-[40%] shrink-0 truncate rounded bg-[#1b2636] px-2 py-0.5 font-mono text-xs opacity-75" :title="rootPath">
          {{ rootPath }}
        </span>
      </div>

      <p v-if="loading" class="m-0 px-3 py-4 opacity-60">
        Loading folders…
      </p>
      <p v-else-if="errorMessage" role="alert" class="m-0 px-3 py-4 text-[#f87171]">
        {{ errorMessage }}
      </p>
      <ul v-else-if="filtered.length" ref="list" class="m-0 flex-1 list-none overflow-y-auto px-0 py-1" role="listbox">
        <li
          v-for="(folder, i) in filtered"
          :key="folder"
          class="cursor-pointer truncate px-3 py-1.5 font-mono text-[13px]"
          :class="{ 'bg-[#34507a]': i === selected }"
          role="option"
          :aria-selected="i === selected"
          :title="folder"
          @mousemove="selected = i"
          @click="selectFolder(i)"
        >
          {{ folder }}
        </li>
      </ul>
      <p v-else class="m-0 px-3 py-4 opacity-60">
        {{ folders.length ? 'No matching folders' : 'No folders found' }}
      </p>

      <footer class="flex items-center justify-between border-t border-[#3a4b63] border-t-solid px-3 py-1.5 text-xs opacity-80">
        <span>↑↓ select · Enter open · Esc close</span>
        <button
          type="button"
          class="cursor-pointer border border-[#3a4b63] rounded border-solid bg-transparent px-2 py-0.5 text-inherit [font:inherit]"
          :aria-pressed="recursive"
          @click="toggleRecursive"
        >
          {{ recursive ? 'Recursive: On' : 'Recursive: Off' }}
        </button>
      </footer>
    </div>
  </div>
</template>
