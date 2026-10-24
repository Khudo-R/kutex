import { executeCommand, getCwd, runCommand } from '@/entities/terminal'
import { clearHistory, getHistory } from '@/features/command-history'

export interface KutexGlobalApi {
  executeCommand: typeof executeCommand
  runCommand: typeof runCommand
  getCwd: typeof getCwd
  getHistory: typeof getHistory
  clearHistory: typeof clearHistory
}

/** Exposes programmatic command methods on `window.kutex`. */
export function registerKutexGlobal(target: { kutex?: KutexGlobalApi } = window as unknown as { kutex?: KutexGlobalApi }): void {
  target.kutex = {
    executeCommand,
    runCommand,
    getCwd,
    getHistory,
    clearHistory,
  }
}
