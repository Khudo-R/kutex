import {
  EventsOn,
  ExecuteCommand,
  GetCwd,
  Resize,
  RunCommand,
  Start,
  Stop,
  Write,
} from '@/shared/api'
import { decodeBase64 } from '@/shared/lib/base64'

/** Must match the event names in internal/terminal/events.go. */
export const TERMINAL_EVENTS = {
  Output: 'terminal:output',
  Exit: 'terminal:exit',
} as const

export const startTerminal = Start
export const writeTerminal = Write
export const resizeTerminal = Resize
export const stopTerminal = Stop
export const executeCommand = ExecuteCommand
export const runCommand = RunCommand
export const getCwd = GetCwd

export function onTerminalOutput(listener: (bytes: Uint8Array) => void): () => void {
  return EventsOn(TERMINAL_EVENTS.Output, (chunk: string) => listener(decodeBase64(chunk)))
}

export function onTerminalExit(listener: (exitCode: number) => void): () => void {
  return EventsOn(TERMINAL_EVENTS.Exit, listener)
}
