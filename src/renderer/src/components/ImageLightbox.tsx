import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent
} from 'react'

import { useT } from '../i18n'
import { IconClose, IconPlus } from './Icons'

/** 相对「适应窗口」的倍率；1 = 刚好铺满可视区 */
const MIN_USER_SCALE = 0.5
const MAX_USER_SCALE = 16
const ZOOM_STEP = 1.25

export interface ImageLightboxProps {
  src: string
  alt?: string
  onClose: () => void
}

function clampUserScale(next: number): number {
  return Math.min(MAX_USER_SCALE, Math.max(MIN_USER_SCALE, next))
}

/**
 * 全屏图片预览。
 *
 * ⚠️ 缩放必须改 img 的 layout 宽高（按 naturalWidth 计算），不能用
 * `transform: scale`：后者只是把「已经按窗口缩小后光栅化」的位图再放大，
 * 大图一放大就糊成缩略图。按像素尺寸布局时，浏览器会从原图重采样，才能看清细节。
 */
export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps): JSX.Element {
  const t = useT()
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  const [userScale, setUserScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const userScaleRef = useRef(1)
  const offsetRef = useRef(offset)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const didDragRef = useRef(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    userScaleRef.current = userScale
  }, [userScale])
  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  // 舞台尺寸（去掉工具栏/提示条后的可视区）
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const apply = (): void => {
      const r = el.getBoundingClientRect()
      setStageSize({ w: r.width, h: r.height })
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitScale =
    natural && stageSize.w > 0 && stageSize.h > 0
      ? Math.min(stageSize.w / natural.w, stageSize.h / natural.h)
      : 1
  // 显示尺寸 = 原图像素 × 适应倍率 × 用户缩放；始终从原图重采样
  const displayScale = fitScale * userScale
  const displayW = natural ? Math.max(1, natural.w * displayScale) : undefined
  const displayH = natural ? Math.max(1, natural.h * displayScale) : undefined
  // 工具栏百分比：相对原图像素（100% = 1:1），比「相对适应窗口」更直观
  const nativePct = Math.max(1, Math.round(displayScale * 100))
  const largerThanStage =
    !!natural &&
    stageSize.w > 0 &&
    (displayW! > stageSize.w + 1 || displayH! > stageSize.h + 1)

  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number): void => {
    setUserScale((prev) => {
      const next = clampUserScale(prev * factor)
      if (next === prev) return prev
      if (clientX == null || clientY == null || !stageRef.current) {
        if (next <= 1) setOffset({ x: 0, y: 0 })
        return next
      }
      const rect = stageRef.current.getBoundingClientRect()
      const cx = clientX - rect.left - rect.width / 2
      const cy = clientY - rect.top - rect.height / 2
      const ratio = next / prev
      setOffset((o) => {
        if (next <= 1) return { x: 0, y: 0 }
        return { x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio }
      })
      return next
    })
  }, [])

  const zoomToUser = useCallback(
    (next: number, clientX?: number, clientY?: number): void => {
      const prev = userScaleRef.current
      if (prev <= 0) return
      zoomBy(next / prev, clientX, clientY)
    },
    [zoomBy]
  )

  const resetView = useCallback((): void => {
    setUserScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  /** 双击：适应窗口 ⇄ 原图 1:1（图比窗口小则 ⇄ 2× 适应） */
  const toggleNativeOrFit = useCallback(
    (clientX: number, clientY: number): void => {
      if (userScaleRef.current > 1.05) {
        resetView()
        return
      }
      const targetUser = fitScale > 0 ? Math.max(1 / fitScale, 2) : 2
      zoomToUser(Math.min(MAX_USER_SCALE, targetUser), clientX, clientY)
    },
    [fitScale, resetView, zoomToUser]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomBy(ZOOM_STEP)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomBy(1 / ZOOM_STEP)
      } else if (e.key === '0') {
        e.preventDefault()
        resetView()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, resetView, zoomBy])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onWheelNative = (e: WheelEvent): void => {
      e.preventDefault()
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX, e.clientY)
    }
    window.addEventListener('wheel', onWheelNative, { passive: false })
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('wheel', onWheelNative)
    }
  }, [zoomBy])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    didDragRef.current = false
    if (!largerThanStage) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    if (Math.abs(e.clientX - drag.startX) > 3 || Math.abs(e.clientY - drag.startY) > 3) {
      didDragRef.current = true
    }
    setOffset({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY)
    })
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
  }

  const onDoubleClick = (e: ReactMouseEvent): void => {
    e.stopPropagation()
    toggleNativeOrFit(e.clientX, e.clientY)
  }

  const onStageClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    if (didDragRef.current) return
    const img = imgRef.current
    if (!img) {
      onClose()
      return
    }
    const r = img.getBoundingClientRect()
    const { clientX: x, clientY: y } = e
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) onClose()
  }

  const onImgLoad = (e: SyntheticEvent<HTMLImageElement>): void => {
    const img = e.currentTarget
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    }
  }

  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt || t('chat.imageFallback')}
      onClick={onClose}
    >
      <div className="image-lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="icon-btn"
          title={t('chat.imageZoomOut')}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          disabled={userScale <= MIN_USER_SCALE}
        >
          <span className="image-lightbox-zoom-glyph" aria-hidden>
            −
          </span>
        </button>
        <button
          type="button"
          className="image-lightbox-scale"
          title={t('chat.imageZoomReset')}
          onClick={resetView}
        >
          {nativePct}%
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('chat.imageZoomIn')}
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={userScale >= MAX_USER_SCALE}
        >
          <IconPlus size={14} />
        </button>
        <button type="button" className="icon-btn" title={t('chat.imageZoomClose')} onClick={onClose}>
          <IconClose size={14} />
        </button>
      </div>

      <div
        ref={stageRef}
        className={`image-lightbox-stage${largerThanStage ? ' is-panning' : ''}`}
        onClick={onStageClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      >
        <img
          ref={imgRef}
          className={`image-lightbox-img${natural ? ' is-sized' : ''}`}
          src={src}
          alt={alt ?? ''}
          draggable={false}
          onLoad={onImgLoad}
          style={{
            width: displayW,
            height: displayH,
            transform: `translate(${offset.x}px, ${offset.y}px)`
          }}
        />
      </div>

      <div className="image-lightbox-hint muted" onClick={onClose}>
        {t('chat.imageZoomHint')}
      </div>
    </div>
  )
}
