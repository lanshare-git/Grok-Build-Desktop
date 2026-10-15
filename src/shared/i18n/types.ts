/** i18n 基础类型 —— 三端共享（main / preload / renderer） */

/** 支持的界面语言 */
export type Locale = 'zh-CN' | 'en' | 'ja'

/** t() 插值变量 */
export type MessageVars = Record<string, string | number>

/**
 * 字典叶子值：纯字符串（可含 {var} 占位）或函数（处理数量/拼接等动态文案）。
 * 函数参数刻意放宽为 any：各字典可按需声明更精确的参数类型。
 */
export type MessageLeaf = string | ((vars: any) => string)
