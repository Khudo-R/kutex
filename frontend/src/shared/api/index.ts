import { Events } from '@wailsio/runtime'

export {
  GetFolders,
  GetFoldersRecursive,
} from '../../../bindings/kutex/internal/system/system'

export {
  AddHistory,
  ClearHistory,
  ExecuteCommand,
  GetCwd,
  GetHistory,
  Resize,
  RunCommand,
  Start,
  Stop,
  Write,
} from '../../../bindings/kutex/internal/terminal/terminal'

export function EventsOn<T = any>(eventName: string, callback: (data: T) => void): () => void {
  return Events.On(eventName, (event: { data: T }) => callback(event.data))
}
