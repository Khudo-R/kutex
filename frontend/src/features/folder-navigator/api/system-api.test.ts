import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  GetFolders: vi.fn(),
  GetFoldersRecursive: vi.fn(),
}))

vi.mock('@/shared/api', () => ({
  GetFolders: mocks.GetFolders,
  GetFoldersRecursive: mocks.GetFoldersRecursive,
}))

describe('features/folder-navigator api', () => {
  it('exposes getFolders and getFoldersRecursive', async () => {
    const api = await import('./system-api')

    expect(api.getFolders).toBe(mocks.GetFolders)
    expect(api.getFoldersRecursive).toBe(mocks.GetFoldersRecursive)
  })
})
