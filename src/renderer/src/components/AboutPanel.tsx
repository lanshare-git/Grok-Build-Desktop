import { useEffect, useState } from 'react'

import { getCloseAction, setCloseAction } from '../actions'
import { useStore } from '../store'
import { useT } from '../i18n'
import { IconCopy, IconGrok } from './Icons'
import type { CloseAction } from '@shared/types'

/* ------------------------------------------------------------------ *
 *  「关于」—— 设置中心「关于」分区的内容（版本信息的唯一出口）
 *
 *  为什么值得单独做：版本号只在 package.json 里时，出了「我跑的到底是哪一份」
 *  这类问题就只能靠猜。同一版本号可能有两次不同时间打的包，
 *  所以这里同时展示 package.json 的版本号与打包时刻（编译期注入）。
 * ------------------------------------------------------------------ */

function formatBuildTime(iso: string, unknownLabel: string): string {
  if (!iso) return unknownLabel
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function AboutPanel(): JSX.Element {
  const t = useT()
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
    info ? t('panels.about.copyLineBuiltAt', { time: formatBuildTime(info.buildTime, t('panels.about.unknown')) }) : '',
    info ? `Electron ${info.electron} / Chromium ${info.chrome} / Node ${info.node}` : '',
    grokVersion ? `Grok Build ${grokVersion}` : '',
    proxy ? t('panels.about.copyLineProxy', { proxy }) : ''
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
            {t('panels.about.versionLabel')} {info ? `v${info.version}` : t('panels.about.versionReading')}
            {info && !info.packaged && <span className="about-tag">{t('panels.about.devModeTag')}</span>}
          </div>
        </div>
      </div>

      <div className="about-rows">
        <div className="about-row">
          <span className="muted">{t('panels.about.rowBuildTime')}</span>
          <code>{info ? formatBuildTime(info.buildTime, t('panels.about.unknown')) : '—'}</code>
        </div>
        {/* 两个都叫「Grok Build」，标签必须区分开：桌面端是壳，终端是实际干活的 agent */}
        <div className="about-row">
          <span className="muted">{t('panels.about.rowGrokCli')}</span>
          <code>{grokVersion ? `v${grokVersion}` : t('panels.about.unknown')}</code>
        </div>
        <div className="about-row">
          <span className="muted">{t('panels.about.rowRuntime')}</span>
          <code>
            {info
              ? `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`
              : '—'}
          </code>
        </div>
        <div className="about-row">
          <span className="muted">{t('panels.about.rowProxy')}</span>
          <code>{proxy ?? t('panels.about.proxyDirect')}</code>
        </div>
      </div>

      <div className="check-hint">{t('panels.about.hint')}</div>

      <div className="modal-actions">
        <button
          className="btn btn-ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(copyText)
          }}
        >
          <IconCopy size={13} />
          {t('panels.about.copyInfo')}
        </button>
      </div>
    </div>
  )
}
