import { describe, expect, it, vi } from 'vitest'
import { executeCommand, getCwd, runCommand } from '@/entities/terminal'
import { clearHistory, getHistory } from '@/features/command-history'
import { registerKutexGlobal } from './kutex-global'

vi.mock('@/entities/terminal', () => ({
  executeCommand: vi.fn(),
  runCommand: vi.fn(),
  getCwd: vi.fn(),
}))

vi.mock('@/features/command-history', () => ({
  getHistory: vi.fn(),
  clearHistory: vi.fn(),
}))

describe('registerKutexGlobal', () => {
  it('registers programmatic API methods on window.kutex by default', () => {
    registerKutexGlobal()

    const kutex = (window as unknown as { kutex?: Record<string, unknown> }).kutex
    expect(kutex).toEqual({
      executeCommand,
      runCommand,
      getCwd,
      getHistory,
      clearHistory,
    })
  })

  it('registers programmatic API methods on a custom target', () => {
    const target: { kutex?: unknown } = {}
    registerKutexGlobal(target as never)

    expect(target.kutex).toEqual({
      executeCommand,
      runCommand,
      getCwd,
      getHistory,
      clearHistory,
    })
  })
})
