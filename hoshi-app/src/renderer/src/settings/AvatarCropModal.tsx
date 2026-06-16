import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AVATAR_CROP_MAX_ZOOM,
  AVATAR_CROP_MIN_ZOOM,
  AVATAR_CROP_VIEWPORT_SIZE,
  blobToAvatarFile,
  clampAvatarCropTransform,
  computeCoverScale,
  createInitialAvatarCropTransform,
  cropAvatarToBlob,
  loadImageFromFile,
  type AvatarCropTransform
} from './avatarCrop'
import './AvatarCropModal.css'

interface AvatarCropModalProps {
  file: File
  onCancel: () => void
  onConfirm: (file: File) => Promise<void>
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

export function AvatarCropModal({
  file,
  onCancel,
  onConfirm
}: AvatarCropModalProps): React.JSX.Element {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [transform, setTransform] = useState<AvatarCropTransform>(createInitialAvatarCropTransform)
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setImage(null)
    setTransform(createInitialAvatarCropTransform())

    void loadImageFromFile(file)
      .then((loaded) => {
        if (!cancelled) {
          setImage(loaded)
          setTransform(createInitialAvatarCropTransform())
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '图片加载失败')
        }
      })

    return () => {
      cancelled = true
    }
  }, [file])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !submitting) {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, submitting])

  const coverScale = useMemo(() => {
    if (!image) {
      return 1
    }
    return computeCoverScale(image.naturalWidth, image.naturalHeight, AVATAR_CROP_VIEWPORT_SIZE)
  }, [image])

  const clampedTransform = useMemo(() => {
    if (!image) {
      return transform
    }
    return clampAvatarCropTransform(
      transform,
      image.naturalWidth,
      image.naturalHeight,
      AVATAR_CROP_VIEWPORT_SIZE
    )
  }, [image, transform])

  const imageStyle = useMemo(() => {
    if (!image) {
      return undefined
    }
    const scale = coverScale * clampedTransform.zoom
    return {
      width: `${image.naturalWidth}px`,
      height: `${image.naturalHeight}px`,
      transform: `translate(-50%, -50%) translate(${clampedTransform.offsetX}px, ${clampedTransform.offsetY}px) scale(${scale})`
    }
  }, [clampedTransform.offsetX, clampedTransform.offsetY, clampedTransform.zoom, coverScale, image])

  const updateTransform = (next: AvatarCropTransform): void => {
    if (!image) {
      setTransform(next)
      return
    }
    setTransform(
      clampAvatarCropTransform(next, image.naturalWidth, image.naturalHeight, AVATAR_CROP_VIEWPORT_SIZE)
    )
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!image || submitting) {
      return
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: clampedTransform.offsetX,
      originY: clampedTransform.offsetY
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    updateTransform({
      ...clampedTransform,
      offsetX: drag.originX + (event.clientX - drag.startX),
      offsetY: drag.originY + (event.clientY - drag.startY)
    })
  }

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore if capture was already released.
    }
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    if (!image || submitting) {
      return
    }
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.08 : 0.08
    updateTransform({
      ...clampedTransform,
      zoom: clampedTransform.zoom + delta
    })
  }

  const handleConfirm = async (): Promise<void> => {
    if (!image) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const blob = await cropAvatarToBlob(image, clampedTransform)
      await onConfirm(blobToAvatarFile(blob, file.name))
    } catch (err) {
      setError(err instanceof Error ? err.message : '头像保存失败')
      setSubmitting(false)
    }
  }

  return (
    <div className="avatar-crop-overlay" role="presentation" onMouseDown={(event) => event.stopPropagation()}>
      <div className="avatar-crop-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
        <h3 id="avatar-crop-title" className="avatar-crop-modal__title">
          裁剪头像
        </h3>
        <p className="avatar-crop-modal__hint">拖动图片选择展示区域，可缩放调整。</p>

        <div
          className={`avatar-crop-modal__viewport ${dragging ? 'is-dragging' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onWheel={handleWheel}
        >
          {image ? (
            <img
              className="avatar-crop-modal__image"
              src={image.src}
              alt="待裁剪头像"
              draggable={false}
              style={imageStyle}
            />
          ) : null}
          <div className="avatar-crop-modal__mask" aria-hidden />
          <div className="avatar-crop-modal__frame" aria-hidden />
        </div>

        <div className="avatar-crop-modal__zoom">
          <label htmlFor="avatar-crop-zoom">缩放</label>
          <input
            id="avatar-crop-zoom"
            type="range"
            min={AVATAR_CROP_MIN_ZOOM}
            max={AVATAR_CROP_MAX_ZOOM}
            step={0.01}
            value={clampedTransform.zoom}
            disabled={!image || submitting}
            onChange={(event) =>
              updateTransform({
                ...clampedTransform,
                zoom: Number(event.target.value)
              })
            }
          />
        </div>

        <p className="avatar-crop-modal__status">
          {error ? error : submitting ? '正在上传…' : image ? null : '正在加载图片…'}
        </p>

        <div className="avatar-crop-modal__actions">
          <button type="button" className="settings-btn" disabled={submitting} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="settings-btn settings-btn--primary"
            disabled={!image || submitting}
            onClick={() => void handleConfirm()}
          >
            {submitting ? '保存中…' : '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
