import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import App from './App.vue'
import { registerKutexGlobal } from './providers/kutex-global'

vi.mock('./providers/kutex-global', () => ({
  registerKutexGlobal: vi.fn(),
}))

vi.mock('@/pages/terminal', () => ({
  TerminalPage: defineComponent({
    name: 'TerminalPage',
    setup() {
      return () => h('div', { 'data-testid': 'terminal-page' })
    },
  }),
}))

describe('app root component', () => {
  it('registers window.kutex global API and renders TerminalPage', () => {
    const wrapper = mount(App)

    expect(registerKutexGlobal).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid="terminal-page"]').exists()).toBe(true)
  })
})
