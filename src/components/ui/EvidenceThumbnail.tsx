import React, { useState } from 'react'
import { IconPhoto, IconZoomIn, IconX, IconUser, IconClock, IconSignature } from '@tabler/icons-react'
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

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-32 h-32',
  }[size]

  const isSignature = evidence.category === 'signature'

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className={`group relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 cursor-pointer hover:border-blue-500 transition-all ${sizeClasses} ${className}`}
      >
        {evidence.url ? (
          <img
            src={evidence.url}
            alt={evidence.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-900">
            {isSignature ? <IconSignature className="w-6 h-6" /> : <IconPhoto className="w-6 h-6" />}
          </div>
        )}

        {/* Hover overlay with zoom icon */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <IconZoomIn className="w-5 h-5 text-white" />
        </div>

        {/* Category tag */}
        <span className="absolute bottom-1 right-1 text-[9px] font-semibold px-1 py-0.2 rounded bg-black/70 text-slate-200 uppercase">
          {evidence.category}
        </span>
      </div>

      {/* Full Evidence Zoom Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="fixed inset-0" onClick={() => setIsOpen(false)} />

          <div className="relative z-10 max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-white">{evidence.title}</h3>
                <span className="text-xs uppercase tracking-wider text-blue-400 font-semibold">
                  Category: {evidence.category}
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            {/* Media Body */}
            <div className="flex-1 overflow-auto bg-slate-950 flex items-center justify-center p-4 min-h-[300px]">
              {evidence.url ? (
                <img
                  src={evidence.url}
                  alt={evidence.title}
                  className="max-h-[60vh] max-w-full object-contain rounded-lg border border-slate-800"
                />
              ) : (
                <div className="text-slate-500 flex flex-col items-center gap-2">
                  <IconPhoto className="w-12 h-12" />
                  <span>No image data available</span>
                </div>
              )}
            </div>

            {/* Metadata Footer */}
            <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <IconClock className="w-4 h-4 text-slate-500" />
                  <BsAdDate date={evidence.capturedAt} layout="inline" showTime />
                </div>
                {evidence.capturedBy && (
                  <div className="flex items-center gap-1.5">
                    <IconUser className="w-4 h-4 text-slate-500" />
                    <span>Captured by {evidence.capturedBy}</span>
                  </div>
                )}
              </div>
              {evidence.notes && <p className="text-slate-300 italic">{evidence.notes}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
