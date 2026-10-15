import { useState } from 'react'

import { useT } from '../i18n'
import { useStore } from '../store'
import type { UserQuestionEvent } from '@shared/types'

/**
 * Agent 提问面板（对应 grok 的 ask_user_question 工具）。
 *
 * 与授权面板一样**内联**在对应任务的输入框上方：单选点选项立即提交；多选先勾选
 * 再统一提交；也可以填自定义回答。不再做成铺满全屏的模态框。
 */
export default function QuestionPanel({ event }: { event: UserQuestionEvent }): JSX.Element | null {
  const t = useT()
  const { questions } = event
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})

  if (!questions.length) return null

  const decide = (answers: Record<string, string> | null): void => {
    void window.grok.respondQuestion(event.requestId, answers)
    useStore.getState().clearQuestion(event.requestId)
  }

  const toggle = (qi: number, label: string): void => {
    setPicked((prev) => {
      const cur = prev[qi] ?? []
      const next = questions[qi].multiSelect
        ? cur.includes(label)
          ? cur.filter((x) => x !== label)
          : [...cur, label]
        : [label]
      return { ...prev, [qi]: next }
    })
  }

  const submitAll = (): void => {
    const answers: Record<string, string> = {}
    questions.forEach((q, qi) => {
      const customText = custom[qi]?.trim()
      const labels = picked[qi] ?? []
      answers[q.question] = customText
        ? q.multiSelect
          ? [...labels, customText].join('、')
          : customText
        : labels.join('、')
    })
    decide(answers)
  }

  const allAnswered = questions.every((q, qi) => {
    if (custom[qi]?.trim()) return true
    return (picked[qi] ?? []).length > 0
  })

  return (
    <div className="prompt-card prompt-card-question">
      <div className="prompt-head">
        <span className="prompt-badge prompt-badge-question">{t('prompts.question.badge')}</span>
        <span className="prompt-title">{t('prompts.question.title')}</span>
        <span className="prompt-sub-inline">{t('prompts.question.subtitle')}</span>
      </div>

      {questions.map((q, qi) => (
        <div key={qi} className="question-block">
          <div className="question-text">{q.question}</div>
          <div className="question-options">
            {q.options.map((opt) => {
              const isPicked = (picked[qi] ?? []).includes(opt.label)
              return (
                <button
                  key={opt.label}
                  className={`question-option ${isPicked ? 'is-picked' : ''}`}
                  onClick={() => toggle(qi, opt.label)}
                >
                  <span className="question-option-label">{opt.label}</span>
                  {opt.description && (
                    <span className="question-option-desc">{opt.description}</span>
                  )}
                </button>
              )
            })}
          </div>
          <input
            className="question-custom"
            placeholder={t('prompts.question.customPlaceholder')}
            value={custom[qi] ?? ''}
            onChange={(e) => setCustom((prev) => ({ ...prev, [qi]: e.target.value }))}
          />
        </div>
      ))}

      <div className="prompt-actions">
        <button className="btn btn-primary" disabled={!allAnswered} onClick={submitAll}>
          {t('prompts.question.submit')}
        </button>
        <button className="btn btn-ghost" onClick={() => decide(null)}>
          {t('prompts.question.cancelLetAgent')}
        </button>
      </div>
    </div>
  )
}
