import { beforeEach, describe, expect, it, vi } from 'vitest'

const mountMock = vi.fn()
const createAppMock = vi.fn(() => ({ mount: mountMock }))

vi.mock('vue', async importOriginal => ({
  ...await importOriginal<typeof import('vue')>(),
  createApp: createAppMock,
}))

vi.mock('@/app/App.vue', () => ({
  default: { name: 'AppStub' },
}))

describe('main entrypoint & app bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts App on #app when main.ts is imported', async () => {
    const { App } = await import('@/app')
    await import('./main')

    expect(createAppMock).toHaveBeenCalledExactlyOnceWith(App)
    expect(mountMock).toHaveBeenCalledExactlyOnceWith('#app')
  })

  it('uses default #app selector in mountApp when called without arguments', async () => {
    const { App, mountApp } = await import('@/app')
    mountApp()

    expect(createAppMock).toHaveBeenCalledExactlyOnceWith(App)
    expect(mountMock).toHaveBeenCalledExactlyOnceWith('#app')
  })
})
