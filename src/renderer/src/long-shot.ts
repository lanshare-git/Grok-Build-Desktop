/**
 * 会话长截屏：从指定消息顶滚到对话底部，分段 capturePage 后拼成一张 PNG。
 *
 * 为什么不在渲染层用 html2canvas：
 *  - Electron 已有 webContents.capturePage，能拿到真实合成结果（含原生字体/阴影）
 *  - 不引入额外依赖，拼图在 canvas 上完成即可
 *
 * 坐标约定：getBoundingClientRect 与 capturePage 的 rect 都是窗口客户区 DIP。
 */

/** 相邻两帧重叠像素，避免滚屏缝 */
const OVERLAP_PX = 32
/** 浏览器 canvas 高度上限附近留余量；超出会截断并在结果里标明 */
const MAX_CSS_HEIGHT = 16_000

function waitPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function captureScrollerSlice(
  scroller: HTMLElement,
  heightCss: number
): Promise<ImageBitmap> {
  const rect = scroller.getBoundingClientRect()
  const h = Math.max(1, Math.min(Math.round(heightCss), Math.round(rect.height)))
  const png = await window.grok.capturePageRect({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: h
  })
  const bytes = png instanceof Uint8Array ? png : new Uint8Array(png)
  // 拷一份到确定的 ArrayBuffer，避开 SharedArrayBuffer 与 BlobPart 的类型不合
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return createImageBitmap(new Blob([copy.buffer], { type: 'image/png' }))
}

export interface LongShotResult {
  /** 最终 PNG 字节 */
  png: Uint8Array
  /** 是否因高度上限截断 */
  truncated: boolean
  /** 拼图 CSS 高度 */
  heightCss: number
}

/**
 * 从 `startEl` 顶部滚到 scroller 底部并拼图。
 * 调用前应已进入「截取中」态并藏起选点条，避免进画面。
 */
export async function captureLongShotFromElement(
  scroller: HTMLElement,
  startEl: HTMLElement
): Promise<LongShotResult> {
  const prevScroll = scroller.scrollTop
  const prevPin = scroller.style.scrollBehavior
  scroller.style.scrollBehavior = 'auto'

  try {
    // 把起点顶到可视区上沿
    const startTop =
      startEl.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop
    scroller.scrollTop = Math.max(0, startTop)
    await waitPaint()
    await sleep(40)

    const viewportH = scroller.clientHeight
    const totalH = scroller.scrollHeight
    const startScroll = scroller.scrollTop
    const captureEnd = Math.min(totalH, startScroll + MAX_CSS_HEIGHT)
    const truncated = totalH - startScroll > MAX_CSS_HEIGHT

    const slices: ImageBitmap[] = []
    let y = startScroll
    while (y < captureEnd - 0.5) {
      scroller.scrollTop = y
      await waitPaint()
      await sleep(30)
      const remaining = captureEnd - y
      const sliceH = Math.min(viewportH, remaining)
      slices.push(await captureScrollerSlice(scroller, sliceH))
      if (y + sliceH >= captureEnd - 0.5) break
      y += Math.max(1, sliceH - OVERLAP_PX)
    }

    if (slices.length === 0) {
      throw new Error('没有可截取的内容')
    }

    // 各 slice 的 intrinsic 像素尺寸可能含 DPR；按第一张的 scale 对齐
    const scale = slices[0].width / Math.max(1, scroller.clientWidth)
    const outW = slices[0].width
    let outH = slices[0].height
    for (let i = 1; i < slices.length; i++) {
      const overlapPx = Math.round(OVERLAP_PX * scale)
      outH += Math.max(0, slices[i].height - overlapPx)
    }

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')

    let dy = 0
    for (let i = 0; i < slices.length; i++) {
      const img = slices[i]
      if (i === 0) {
        ctx.drawImage(img, 0, 0)
        dy = img.height
      } else {
        const overlapPx = Math.round(OVERLAP_PX * scale)
        ctx.drawImage(
          img,
          0,
          overlapPx,
          img.width,
          img.height - overlapPx,
          0,
          dy,
          img.width,
          img.height - overlapPx
        )
        dy += img.height - overlapPx
      }
      img.close()
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))),
        'image/png'
      )
    })
    const buf = new Uint8Array(await blob.arrayBuffer())
    return {
      png: buf,
      truncated,
      heightCss: Math.round(outH / scale)
    }
  } finally {
    scroller.scrollTop = prevScroll
    scroller.style.scrollBehavior = prevPin
  }
}
