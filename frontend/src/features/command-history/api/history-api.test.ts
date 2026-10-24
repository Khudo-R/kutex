import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  AddHistory: vi.fn(),
  GetHistory: vi.fn(),
  ClearHistory: vi.fn(),
}))

vi.mock('@/shared/api', () => ({
  AddHistory: mocks.AddHistory,
  GetHistory: mocks.GetHistory,
  ClearHistory: mocks.ClearHistory,
}))

describe('features/command-history api', () => {
  it('exposes addHistory, getHistory, and clearHistory', async () => {
    const api = await import('./history-api')

    expect(api.addHistory).toBe(mocks.AddHistory)
    expect(api.getHistory).toBe(mocks.GetHistory)
    expect(api.clearHistory).toBe(mocks.ClearHistory)
  })
})
