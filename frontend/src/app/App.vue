<script lang="ts" setup>
import { TerminalPage } from '@/pages/terminal'
import { registerKutexGlobal } from './providers/kutex-global'

registerKutexGlobal()
</script>

<template>
  <TerminalPage />
</template>
