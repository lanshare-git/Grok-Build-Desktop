interface IconProps {
  size?: number
  className?: string
}

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className
})

/** Grok 官方 logo（矢量，来自 xAI 品牌图形） */
export const IconGrok = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg width={size} height={size} viewBox="0.36 0.5 33.33 32" fill="currentColor" className={className}>
    <path d="M13.2371 21.0407L24.3186 12.8506C24.8619 12.4491 25.6384 12.6057 25.8973 13.2294C27.2597 16.5185 26.651 20.4712 23.9403 23.1851C21.2297 25.8989 17.4581 26.4941 14.0108 25.1386L10.2449 26.8843C15.6463 30.5806 22.2053 29.6665 26.304 25.5601C29.5551 22.3051 30.562 17.8683 29.6205 13.8673L29.629 13.8758C28.2637 7.99809 29.9647 5.64871 33.449 0.844576C33.5314 0.730667 33.6139 0.616757 33.6964 0.5L29.1113 5.09055V5.07631L13.2343 21.0436" />
    <path d="M10.9503 23.0313C7.07343 19.3235 7.74185 13.5853 11.0498 10.2763C13.4959 7.82722 17.5036 6.82767 21.0021 8.2971L24.7595 6.55998C24.0826 6.07017 23.215 5.54334 22.2195 5.17313C17.7198 3.31926 12.3326 4.24192 8.67479 7.90126C5.15635 11.4239 4.0499 16.8403 5.94992 21.4622C7.36924 24.9165 5.04257 27.3598 2.69884 29.826C1.86829 30.7002 1.0349 31.5745 0.36364 32.5L10.9474 23.0341" />
  </svg>
)

export const IconPlus = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconTrash = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
)

export const IconFolder = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

export const IconPulse = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M3 12h4l2-5 3 10 2.5-5H21" />
  </svg>
)

export const IconSend = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M12 4l8 16-8-6-8 6z" />
  </svg>
)

export const IconStop = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

export const IconChevron = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export const IconCheck = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M4 12l5 5L20 6" />
  </svg>
)

export const IconClose = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const IconAlert = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M12 3l9 16H3z" />
    <path d="M12 9v5M12 17h.01" />
  </svg>
)

export const IconBrain = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V15a3 3 0 0 0 4 2.8" />
    <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V15a3 3 0 0 1-4 2.8" />
    <path d="M12 4v16" />
  </svg>
)

export const IconTerminal = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9l3 3-3 3M13 15h4" />
  </svg>
)

export const IconFile = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
)

export const IconSearch = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)

export const IconList = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
)

export const IconSpark = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </svg>
)

/** 纯聊天 / 临时会话（对话气泡图标） */
export const IconChat = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-3H6a2 2 0 0 1-2-2z" />
  </svg>
)

export const IconEdit = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
)

export const IconCopy = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export const IconImage = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
)

export const IconScissors = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
  </svg>
)

/** MCP / 插件（插头图标） */
export const IconPlug = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M9 2v6M15 2v6" />
    <path d="M7 8h10v3a5 5 0 0 1-10 0z" />
    <path d="M12 16v6" />
  </svg>
)

/** 隐藏到系统托盘 */
export const IconTray = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <rect x="4" y="13" width="16" height="6" rx="2" />
    <path d="M12 11V7M9 9l3-3 3 3" />
  </svg>
)

/** 电源 / 直接退出 */
export const IconPower = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M12 4v8" />
    <path d="M7.5 7.5a7 7 0 1 0 9 0" />
  </svg>
)

/** 设置（齿轮） */
export const IconGear = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03z" />
  </svg>
)

/** 账号（单人剪影） */
export const IconUser = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
)

/** 版本信息 */
export const IconInfo = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
)

export const IconRefresh = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M20 11a8 8 0 1 0-1.2 5.2M20 5v6h-6" />
  </svg>
)

export const IconDownload = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M12 4v10m0 0 4-4m-4 4-4-4M4 18h16" />
  </svg>
)

export const IconBox = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5zM3 8.5 12 13m0 0 9-4.5M12 13v7" />
  </svg>
)

export const IconGauge = ({ size = 16, className }: IconProps): JSX.Element => (
  <svg {...base(size, className)}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="M12 14l3.5-4" />
  </svg>
)
