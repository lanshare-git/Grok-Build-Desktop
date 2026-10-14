/** 编译期注入的全局常量声明（值由 electron.vite.config.ts 的 define 注入） */

/** 打包时刻，ISO 8601 字符串。用于区分「同版本号、不同构建」的产物 */
declare const __APP_BUILD_TIME__: string