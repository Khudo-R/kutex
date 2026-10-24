import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  Start: vi.fn(),
  Write: vi.fn(),
  Resize: vi.fn(),
  Stop: vi.fn(),
  ExecuteCommand: vi.fn(),
  RunCommand: vi.fn(),
  GetCwd: vi.fn(),
  EventsOn: vi.fn(),
}))

vi.mock('@/shared/api', () => ({
  Start: mocks.Start,
  Write: mocks.Write,
  Resize: mocks.Resize,
  Stop: mocks.Stop,
  ExecuteCommand: mocks.ExecuteCommand,
  RunCommand: mocks.RunCommand,
  GetCwd: mocks.GetCwd,
  EventsOn: mocks.EventsOn,
}))

describe('entities/terminal api', () => {
  it('exposes terminal session and command methods', async () => {
    const api = await import('./terminal-api')

    expect(api.startTerminal).toBe(mocks.Start)
    expect(api.writeTerminal).toBe(mocks.Write)
    expect(api.resizeTerminal).toBe(mocks.Resize)
    expect(api.stopTerminal).toBe(mocks.Stop)
    expect(api.executeCommand).toBe(mocks.ExecuteCommand)
    expect(api.runCommand).toBe(mocks.RunCommand)
    expect(api.getCwd).toBe(mocks.GetCwd)
    expect(api.TERMINAL_EVENTS).toEqual({
      Output: 'terminal:output',
      Exit: 'terminal:exit',
    })
  })

  it('onTerminalOutput subscribes to terminal:output and decodes base64 chunks into Uint8Array', async () => {
    let registeredCallback: ((chunk: string) => void) | undefined
    const off = vi.fn()
    mocks.EventsOn.mockImplementationOnce((_event: string, cb: (chunk: string) => void) => {
      registeredCallback = cb
      return off
    })

    const { onTerminalOutput } = await import('./terminal-api')
    const listener = vi.fn()
    const unsubscribe = onTerminalOutput(listener)

    expect(mocks.EventsOn).toHaveBeenCalledExactlyOnceWith('terminal:output', expect.any(Function))
    registeredCallback!(btoa('ls\r\n'))
    expect(listener).toHaveBeenCalledExactlyOnceWith(new Uint8Array([108, 115, 13, 10]))
    expect(unsubscribe).toBe(off)
  })

  it('onTerminalExit subscribes to terminal:exit with the exit code listener', async () => {
    const off = vi.fn()
    mocks.EventsOn.mockReturnValueOnce(off)

    const { onTerminalExit } = await import('./terminal-api')
    const listener = vi.fn()
    const unsubscribe = onTerminalExit(listener)

    expect(mocks.EventsOn).toHaveBeenCalledExactlyOnceWith('terminal:exit', listener)
    expect(unsubscribe).toBe(off)
  })
})
