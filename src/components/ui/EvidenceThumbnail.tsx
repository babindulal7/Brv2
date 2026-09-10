import React, { useState } from 'react'
import { IconPhoto, IconX, IconUser, IconClock, IconSignature } from '@tabler/icons-react'
import { BsAdDate } from './BsAdDate'

export interface EvidenceItem {
  id: string
  url: string
  title: string
  category: 'packing' | 'handover' | 'return' | 'damage' | 'signature'
  capturedAt: string
  capturedBy?: string
  notes?: string
}

export interface EvidenceThumbnailProps {
  evidence: EvidenceItem
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const EvidenceThumbnail: React.FC<EvidenceThumbnailProps> = ({
  evidence,
  size = 'md',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const sizePx = {
    sm: 48,
    md: 80,
    lg: 128,
  }[size]

  const isSignature = evidence.category === 'signature'

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className={className || undefined}
        style={{
          width: sizePx,
          height: sizePx,
          position: 'relative',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'var(--card2)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {evidence.url ? (
          <img
            src={evidence.url}
            alt={evidence.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              background: 'var(--card2)',
            }}
          >
            {isSignature ? <IconSignature size={24} /> : <IconPhoto size={24} />}
          </div>
        )}

        {/* Category tag */}
        <span
          style={{
            position: 'absolute',
            bottom: 3,
            right: 3,
            fontSize: '9px',
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: 'var(--r-chip)',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            lineHeight: 1.2,
          }}
        >
          {evidence.category}
        </span>
      </div>

      {/* Full Evidence Zoom Modal */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div
            style={{ position: 'fixed', inset: 0 }}
            onClick={() => setIsOpen(false)}
          />

          <div
            style={{
              position: 'relative',
              zIndex: 10,
              maxWidth: 800,
              width: '100%',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                  {evidence.title}
                </h3>
                <span
                  style={{
                    fontSize: 'var(--t-meta)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--nav-active-accent)',
                    fontWeight: 600,
                  }}
                >
                  Category: {evidence.category}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close evidence viewer"
                onClick={() => setIsOpen(false)}
                /* Law 15 — 44×44 touch target */
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text2)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Media Body */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                background: 'var(--card2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                minHeight: 280,
              }}
            >
              {evidence.url ? (
                <img
                  src={evidence.url}
                  alt={evidence.title}
                  style={{
                    maxHeight: '60vh',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                  }}
                />
              ) : (
                <div style={{ color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <IconPhoto size={48} />
                  <span style={{ fontSize: 'var(--t-ui)' }}>No image data available</span>
                </div>
              )}
            </div>

            {/* Metadata Footer */}
            <div
              style={{
                padding: '14px 20px',
                background: 'var(--card)',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconClock size={16} style={{ color: 'var(--muted)' }} />
                  <BsAdDate date={evidence.capturedAt} layout="inline" showTime />
                </div>
                {evidence.capturedBy && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconUser size={16} style={{ color: 'var(--muted)' }} />
                    <span>Captured by {evidence.capturedBy}</span>
                  </div>
                )}
              </div>
              {evidence.notes && <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text)' }}>{evidence.notes}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
