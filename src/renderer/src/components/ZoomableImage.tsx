import { useState } from 'react'

import { useT } from '../i18n'
import ImageLightbox from './ImageLightbox'

interface Props {
  src: string
  alt?: string
  className?: string
  onError?: () => void
}

/** 可点击放大的图片；点击后打开支持缩放/拖拽的全屏预览 */
export default function ZoomableImage({ src, alt, className, onError }: Props): JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const label = alt || t('chat.imageFallback')

  return (
    <>
      <img
        className={className ? `${className} zoomable-image` : 'zoomable-image'}
        src={src}
        alt={label}
        title={t('chat.imageZoomOpen')}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        onError={onError}
      />
      {open && <ImageLightbox src={src} alt={label} onClose={() => setOpen(false)} />}
    </>
  )
}
