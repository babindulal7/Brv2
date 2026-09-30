/**
 * SmartHoverTrigger + SmartHoverPortal — §7–§11, §76, §80–§84.
 *
 * Identifier-only triggers: underline + background highlight on hover,
 * never row scaling (§84). Hover (250ms), safe travel (300ms grace),
 * pin on click / Space, Esc closes with focus return, 500ms long-press
 * opens the bottom sheet on touch (§10).
 */

import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { HOVER_DIMS } from '../../lib/smartHover'
import { intelClosed, intelOpened, useIntelSession } from '../../lib/intel/store'
import type { IntelContext, IntelEntityType } from '../../lib/intel/context'
import { useHoverIntent, useHoverKeyboard, useHoverPosition, useLongPress } from './hooks'

export function SmartHoverTrigger({
  label,
  triggerKind = 'identifier',
  large = false,
  renderCard,
  onOpenEntity,
  entityType,
  entityId,
  context,
}: {
  label: string
  triggerKind?: string
  large?: boolean
  renderCard: (opts: { sheet: boolean; onClose: () => void }) => ReactNode
  onOpenEntity?: () => void
  entityType: IntelEntityType
  entityId: string
  context: IntelContext
}) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cardWrapRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const session = useIntelSession()
  const [sheet, setSheet] = useState(false)
  const { placed, measure } = useHoverPosition()

  const close = useCallback(() => {
    setOpen(false)
    setPinned(false)
    intelClosed(id)
  }, [id])

  useEffect(() => () => intelClosed(id), [id])

  useEffect(() => {
    if (session.openId !== null && session.openId !== id) {
      setOpen(false)
      setPinned(false)
    }
  }, [session.openId, id])

  const claim = (mode: 'hover' | 'pinned' | 'bottom-sheet'): void => {
    intelOpened(id, { entityType, entityId, context }, mode, triggerRef.current)
  }

  const { handleTriggerEnter, handleLeaveBoth, handleCardEnter, handleCardLeave } = useHoverIntent({
    onOpen: () => {
      const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
      setSheet(coarse)
      setOpen(true)
      claim(coarse ? 'bottom-sheet' : 'hover')
      requestAnimationFrame(() => measure(triggerRef.current, large))
    },
    onClose: () => {
      if (!pinned) close()
    },
  })

  useHoverKeyboard({ open, pinned, onClose: () => {
    const back = cardWrapRef.current?.querySelector<HTMLButtonElement>('[aria-label="Back to previous preview"]')
    if (back) back.click()
    else close()
  }, onPin: () => setPinned(true), triggerRef })

  const { start, cancel, handleTap } = useLongPress({
    onPreview: () => {
      setSheet(true)
      setOpen(true)
      setPinned(true)
      claim('bottom-sheet')
    },
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node | null
      if (t === null) return
      const inTrigger = triggerRef.current?.contains(t) ?? false
      const inCard = cardWrapRef.current?.contains(t) ?? false
      if (!inTrigger && !inCard && pinned) close()
      else if (!inTrigger && !inCard && !pinned) {
        // Pinned cards close on outside click; ephemeral ones already
        // close on leave — but a tap outside must still dismiss (§9).
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, pinned, close])

  useEffect(() => {
    if (!open || sheet) return
    const onResize = (): void => measure(triggerRef.current, large)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, sheet, large, measure])

  const card = open ? (
    sheet ? (
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
        style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 'var(--z-drawer)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      >
        <div ref={cardWrapRef}>{renderCard({ sheet: true, onClose: close })}</div>
      </div>
    ) : (
      <div
        ref={cardWrapRef}
        onMouseEnter={handleCardEnter}
        onMouseLeave={handleCardLeave}
        style={{
          position: 'fixed',
          top: placed?.top ?? 0,
          left: placed?.left ?? 0,
          visibility: placed ? 'visible' : 'hidden',
          zIndex: 'var(--z-dropdown)',
          maxWidth: `min(${HOVER_DIMS.maxWidth}px, calc(100vw - 32px))`,
        }}
      >
        {renderCard({ sheet: false, onClose: close })}
      </div>
    )
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-hover-trigger={triggerKind}
        aria-describedby={open ? id : undefined}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleLeaveBoth}
        onFocus={handleTriggerEnter}
        onBlur={handleLeaveBoth}
        onClick={() => {
          if (open && !pinned) {
            setPinned(true)
            claim('pinned')
          } else if (open && pinned) {
            onOpenEntity?.()
          } else {
            setSheet(false)
            setOpen(true)
            setPinned(true)
            claim('pinned')
            requestAnimationFrame(() => measure(triggerRef.current, large))
          }
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' && !open) {
            e.preventDefault()
            setOpen(true)
            setPinned(true)
            claim('pinned')
          }
          if (e.key === 'Enter' && open) {
            onOpenEntity?.()
          }
        }}
        onTouchStart={start}
        onTouchEnd={(e) => {
          cancel()
          e.preventDefault()
          handleTap(() => onOpenEntity?.())
        }}
        onTouchMove={cancel}
        style={{
          background: open ? 'var(--hover-row)' : 'transparent',
          border: 'none',
          minHeight: 'var(--tap)',
          padding: '2px 4px',
          margin: '-2px -4px',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
          textDecoration: 'underline',
          textDecorationColor: 'var(--border2)',
          textUnderlineOffset: 3,
          borderRadius: 4,
        }}
      >
        {label}
      </button>
      <span id={id} style={{ display: 'none' }}>Preview available. Press Space to pin.</span>
      {typeof document !== 'undefined' ? createPortal(card, document.body) : null}
    </>
  )
}
