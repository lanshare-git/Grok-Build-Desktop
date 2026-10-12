import type { GrokDesktopApi } from '../shared/api'

declare global {
  interface Window {
    grok: GrokDesktopApi
  }
}

export {}
