import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  GetFolders: vi.fn(),
  GetFoldersRecursive: vi.fn(),
  AddHistory: vi.fn(),
  ClearHistory: vi.fn(),
  ExecuteCommand: vi.fn(),
  GetCwd: vi.fn(),
  GetHistory: vi.fn(),
  Resize: vi.fn(),
  RunCommand: vi.fn(),
  Start: vi.fn(),
  Stop: vi.fn(),
  Write: vi.fn(),
  EventsOn: vi.fn(),
}))

vi.mock('../../../wailsjs/go/system/System', () => ({
  GetFolders: mocks.GetFolders,
  GetFoldersRecursive: mocks.GetFoldersRecursive,
}))

vi.mock('../../../wailsjs/go/terminal/Terminal', () => ({
  AddHistory: mocks.AddHistory,
  ClearHistory: mocks.ClearHistory,
  ExecuteCommand: mocks.ExecuteCommand,
  GetCwd: mocks.GetCwd,
  GetHistory: mocks.GetHistory,
  Resize: mocks.Resize,
  RunCommand: mocks.RunCommand,
  Start: mocks.Start,
  Stop: mocks.Stop,
  Write: mocks.Write,
}))

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  EventsOn: mocks.EventsOn,
}))

describe('shared/api Wails bindings', () => {
  it('re-exports system, terminal, and runtime bindings', async () => {
    const api = await import('.')

    expect(api.GetFolders).toBe(mocks.GetFolders)
    expect(api.GetFoldersRecursive).toBe(mocks.GetFoldersRecursive)
    expect(api.AddHistory).toBe(mocks.AddHistory)
    expect(api.ClearHistory).toBe(mocks.ClearHistory)
    expect(api.ExecuteCommand).toBe(mocks.ExecuteCommand)
    expect(api.GetCwd).toBe(mocks.GetCwd)
    expect(api.GetHistory).toBe(mocks.GetHistory)
    expect(api.Resize).toBe(mocks.Resize)
    expect(api.RunCommand).toBe(mocks.RunCommand)
    expect(api.Start).toBe(mocks.Start)
    expect(api.Stop).toBe(mocks.Stop)
    expect(api.Write).toBe(mocks.Write)
    expect(api.EventsOn).toBe(mocks.EventsOn)
  })
})
