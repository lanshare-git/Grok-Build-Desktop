import { useEffect, useState } from 'react'

import { getCloseAction, setCloseAction } from '../actions'
import { useStore } from '../store'
import { IconCopy, IconGrok } from './Icons'
import type { CloseAction } from '@shared/types'

/* ------------------------------------------------------------------ *
 *  「关于」—— 设置中心「关于」分区的内容（版本信息的唯一出口）
 *
 *  为什么值得单独做：版本号只在 package.json 里时，出了「我跑的到底是哪一份」
 *  这类问题就只能靠猜。同一版本号可能有两次不同时间打的包，
 *  所以这里同时展示 package.json 的版本号与打包时刻（编译期注入）。
 * ------------------------------------------------------------------ */

function formatBuildTime(iso: string): string {
  if (!iso) return '未知'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function AboutPanel(): JSX.Element {
  const info = useStore((s) => s.appVersion)
  const grokVersion = useStore((s) => s.diagnostics?.version ?? null)
  const proxy = useStore((s) => s.diagnostics?.proxy ?? null)

  //「网络代理」行展示当前生效值；详细配置在「环境自检」分区
  const [closeAction, setCloseActionState] = useState<CloseAction | null>(null)
  useEffect(() => {
    void getCloseAction().then(setCloseActionState)
  }, [])

  const chooseCloseAction = async (action: CloseAction | null): Promise<void> => {
    await setCloseAction(action)
    setCloseActionState(action)
  }

  const copyText = [
    `Grok Build Desktop ${info ? `v${info.version}` : ''}`,
    info ? `构建于 ${formatBuildTime(info.buildTime)}` : '',
    info ? `Electron ${info.electron} / Chromium ${info.chrome} / Node ${info.node}` : '',
    grokVersion ? `Grok Build ${grokVersion}` : '',
    proxy ? `代理 ${proxy}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="settings-page">
      <div className="about-head about-head-embedded">
        <span className="about-mark">
          <IconGrok size={22} />
        </span>
        <div>
          <div className="about-title">Grok Build Desktop</div>
          <div className="about-version">
            版本 {info ? `v${info.version}` : '读取中…'}
            {info && !info.packaged && <span className="about-tag">开发模式</span>}
          </div>
        </div>
      </div>

      <div className="about-rows">
        <div className="about-row">
          <span className="muted">构建时刻</span>
          <code>{info ? formatBuildTime(info.buildTime) : '—'}</code>
        </div>
        {/* 两个都叫「Grok Build」，标签必须区分开：桌面端是壳，终端是实际干活的 agent */}
        <div className="about-row">
          <span className="muted">Grok Build 终端</span>
          <code>{grokVersion ? `v${grokVersion}` : '未知'}</code>
        </div>
        <div className="about-row">
          <span className="muted">运行环境</span>
          <code>
            {info
              ? `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`
              : '—'}
          </code>
        </div>
        <div className="about-row">
          <span className="muted">网络代理</span>
          <code>{proxy ?? '直连'}</code>
        </div>
      </div>

      <div className="check-hint">
        每次改动功能都会升一次版本号（修订 / 新增功能 / 不兼容改动分别对应
        patch / minor / major），并自动记入
        <code className="inline-code">CHANGELOG.md</code>。报问题时附上「构建时刻」这一行，
        能直接定位到具体是哪一份产物。
      </div>

      <div className="modal-actions">
        <button
          className="btn btn-ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(copyText)
          }}
        >
          <IconCopy size={13} />
          复制版本信息
        </button>
      </div>
    </div>
  )
}
