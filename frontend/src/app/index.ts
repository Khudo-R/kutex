import { createApp } from 'vue'
import App from './App.vue'
import './styles'

export { App }

export function mountApp(selector = '#app'): void {
  createApp(App).mount(selector)
}
