import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * 构建时刻（ISO 字符串），编译期注入。
 * 用途：应用内「关于」面板要能区分「同一版本号、不同构建」的产物，
 * 排查问题时比单看 package.json 的 version 更有用。
 */
const buildTime = new Date().toISOString()

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __APP_BUILD_TIME__: JSON.stringify(buildTime)
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __APP_BUILD_TIME__: JSON.stringify(buildTime)
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    define: {
      __APP_BUILD_TIME__: JSON.stringify(buildTime)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})