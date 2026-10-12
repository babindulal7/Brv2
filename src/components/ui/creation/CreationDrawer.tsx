/**
 * src/components/ui/creation/CreationDrawer.tsx — Babin Rentals OS
 *
 * CreationDrawer component for New Equipment and New Expense workflows.
 *
 * Enforces:
 * - Law 6 Money Blindness: Daily rate, replacement value, acquisition costs,
 *   and expense amounts are completely absent for money-blind roles
 *   (Warehouse, Technician, Driver, Client).
 * - Touch targets >= 44x44px (Law 15).
 * - Safe dirty-state discard confirmation.
 * - Form validation (equipment name, category, tracking mode, serials).
 */

import React, { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon'
import { Button } from '../Button'
import { useToast } from '../Toast'
import { useAuth } from '../../../lib/auth'
import { canViewMoney } from '../../../lib/rbac'
import { Modal } from '../Modal'

export interface CreationDrawerProps {
  isOpen: boolean
  actionId: string
  contextData?: Record<string, unknown> | undefined
  onClose: () => void
  onSuccess?: ((record: Record<string, unknown>) => void) | undefined
}

export function CreationDrawer({
  isOpen,
  actionId,
  contextData = {},
  onClose,
  onSuccess,
}: CreationDrawerProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const formId = useId()
  const isMoneyViewer = user ? canViewMoney(user.role) : false

  // ── Equipment Form State ──
  const [eqName, setEqName] = useState('')
  const [eqCategory, setEqCategory] = useState('Camera')
  const [eqBrand, setEqBrand] = useState('')
  const [eqModel, setEqModel] = useState('')
  const [eqSerial, setEqSerial] = useState('')
  const [eqAssetId, setEqAssetId] = useState('')
  const [eqTrackingMode, setEqTrackingMode] = useState<'serialized' | 'bulk'>('serialized')
  const [eqQuantity, setEqQuantity] = useState(1)
  const [eqCondition, setEqCondition] = useState<'New' | 'Good' | 'Fair'>('Good')
  const [eqLocation, setEqLocation] = useState('Main Warehouse')
  const [eqAccessories, setEqAccessories] = useState('')
  const [eqDailyRate, setEqDailyRate] = useState('')
  const [eqReplacementCost, setEqReplacementCost] = useState('')

  // ── Expense Form State ──
  const [expTitle, setExpTitle] = useState('')
  const [expCategory, setExpCategory] = useState('Maintenance')
  const [expAmount, setExpAmount] = useState('')
  const [expDate, setExpDate] = useState(() => new Date().toISOString().split('T')[0] ?? '')
  const [expNotes, setExpNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setEqName(typeof contextData.equipmentName === 'string' ? contextData.equipmentName : '')
      setEqCategory('Camera')
      setEqBrand('')
      setEqModel('')
      setEqSerial('')
      setEqAssetId('')
      setEqTrackingMode('serialized')
      setEqQuantity(1)
      setEqCondition('Good')
      setEqLocation('Main Warehouse')
      setEqAccessories('')
      setEqDailyRate('')
      setEqReplacementCost('')

      setExpTitle('')
      setExpCategory('Maintenance')
      setExpAmount('')
      setExpDate(new Date().toISOString().split('T')[0] ?? '')
      setExpNotes('')

      setErrors({})
      setShowDiscardConfirm(false)
    }
  }, [isOpen, contextData])

  const isDirty = Boolean(
    eqName ||
    eqBrand ||
    eqModel ||
    eqSerial ||
    eqAssetId ||
    eqAccessories ||
    eqDailyRate ||
    expTitle ||
    expAmount
  )

  const handleRequestClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    if (!eqName.trim()) {
      newErrors.eqName = 'Equipment name is required.'
    }
    if (eqTrackingMode === 'serialized' && !eqSerial.trim()) {
      newErrors.eqSerial = 'Serial number is required for tracked assets.'
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    try {
      const record = {
        id: `eq-${Date.now()}`,
        name: eqName.trim(),
        category: eqCategory,
        brand: eqBrand.trim(),
        model: eqModel.trim(),
        serialNumber: eqSerial.trim(),
        assetId: eqAssetId.trim() || `EQ-${Date.now().toString().slice(-4)}`,
        trackingMode: eqTrackingMode,
        quantity: eqQuantity,
        condition: eqCondition,
        location: eqLocation,
        accessories: eqAccessories.trim() ? eqAccessories.split(',').map((s) => s.trim()) : [],
        // Financial fields included only if user is authorized
        ...(isMoneyViewer && eqDailyRate
          ? { dailyRate: Math.round(parseFloat(eqDailyRate) * 100) }
          : {}),
        ...(isMoneyViewer && eqReplacementCost
          ? { replacementCost: Math.round(parseFloat(eqReplacementCost) * 100) }
          : {}),
      }

      showSuccessToast(
        'Equipment Registered',
        `${eqName.trim()} has been added to inventory.`
      )

      onSuccess?.(record)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register equipment.'
      setErrors({ form: msg })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    if (!expTitle.trim()) {
      newErrors.expTitle = 'Expense title or payee is required.'
    }
    if (!expAmount.trim() || isNaN(Number(expAmount))) {
      newErrors.expAmount = 'Valid amount in NPR is required.'
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    try {
      const record = {
        id: `exp-${Date.now()}`,
        title: expTitle.trim(),
        category: expCategory,
        amountPaisa: Math.round(parseFloat(expAmount) * 100),
        date: expDate,
        notes: expNotes.trim(),
        recordedBy: user?.name ?? 'Staff',
      }

      showSuccessToast(
        'Expense Recorded',
        `${expTitle.trim()} logged under ${expCategory}.`
      )

      onSuccess?.(record)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save expense.'
      setErrors({ form: msg })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const titleText = actionId === 'expense.new' ? 'New Expense' : 'New Equipment'
  const isEquipment = actionId !== 'expense.new'

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={handleRequestClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(2px)',
          animation: 'fadeIn 150ms ease-out',
        }}
      />

      {/* Drawer Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={titleText}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          height: '100dvh',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-modal, -4px 0 24px rgba(0,0,0,0.2))',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 51,
          animation: 'slideInRight 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--card2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-btn, 8px)',
                background: 'var(--accent-subtle, rgba(230,81,0,0.1))',
                color: 'var(--accent, #e65100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={isEquipment ? 'box' : 'card'} size={18} />
            </span>
            <h2 style={{ margin: 0, fontSize: 'var(--t-h3, 18px)', fontWeight: 700, color: 'var(--text)' }}>
              {titleText}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Close drawer"
            style={{
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--r-btn, 8px)',
              color: 'var(--text2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {isEquipment ? (
            <form id={formId} onSubmit={handleSaveEquipment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Equipment Name */}
              <div>
                <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                  Equipment Model Name *
                </label>
                <input
                  type="text"
                  value={eqName}
                  onChange={(e) => {
                    setEqName(e.target.value)
                    if (errors.eqName) setErrors((prev) => ({ ...prev, eqName: '' }))
                  }}
                  placeholder="e.g. Sony FX3 Cinema Camera"
                  autoFocus
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: `1px solid ${errors.eqName ? 'var(--danger, #dc2626)' : 'var(--border)'}`,
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-body, 14px)',
                  }}
                />
                {errors.eqName && (
                  <div style={{ color: 'var(--danger, #dc2626)', fontSize: 'var(--t-caption, 12px)', marginTop: 4 }}>
                    {errors.eqName}
                  </div>
                )}
              </div>

              {/* Category & Tracking Mode */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Category *
                  </label>
                  <select
                    value={eqCategory}
                    onChange={(e) => setEqCategory(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-body, 14px)',
                    }}
                  >
                    <option value="Camera">Camera</option>
                    <option value="Lens">Lens</option>
                    <option value="Lighting">Lighting</option>
                    <option value="Audio">Audio</option>
                    <option value="Grip">Grip & Rigging</option>
                    <option value="Drone">Drone</option>
                    <option value="Accessories">Accessories</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Tracking Mode
                  </label>
                  <select
                    value={eqTrackingMode}
                    onChange={(e) => setEqTrackingMode(e.target.value as 'serialized' | 'bulk')}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-body, 14px)',
                    }}
                  >
                    <option value="serialized">Serialized (Individual Unit)</option>
                    <option value="bulk">Bulk / Quantity Tracked</option>
                  </select>
                </div>
              </div>

              {/* Brand & Model */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Brand
                  </label>
                  <input
                    type="text"
                    value={eqBrand}
                    onChange={(e) => setEqBrand(e.target.value)}
                    placeholder="e.g. Sony, Canon, Aputure"
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Model
                  </label>
                  <input
                    type="text"
                    value={eqModel}
                    onChange={(e) => setEqModel(e.target.value)}
                    placeholder="e.g. ILME-FX3"
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
              </div>

              {/* Serial & Asset ID */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Serial Number {eqTrackingMode === 'serialized' ? '*' : ''}
                  </label>
                  <input
                    type="text"
                    value={eqSerial}
                    onChange={(e) => {
                      setEqSerial(e.target.value)
                      if (errors.eqSerial) setErrors((prev) => ({ ...prev, eqSerial: '' }))
                    }}
                    placeholder="e.g. SN-8839210"
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: `1px solid ${errors.eqSerial ? 'var(--danger, #dc2626)' : 'var(--border)'}`,
                      background: 'var(--card)',
                      color: 'var(--text)',
                    }}
                  />
                  {errors.eqSerial && (
                    <div style={{ color: 'var(--danger, #dc2626)', fontSize: 'var(--t-caption, 12px)', marginTop: 4 }}>
                      {errors.eqSerial}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Internal Asset Code
                  </label>
                  <input
                    type="text"
                    value={eqAssetId}
                    onChange={(e) => setEqAssetId(e.target.value)}
                    placeholder="Auto-minted if blank"
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
              </div>

              {/* Condition & Location */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Initial Condition
                  </label>
                  <select
                    value={eqCondition}
                    onChange={(e) => setEqCondition(e.target.value as 'New' | 'Good' | 'Fair')}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                    }}
                  >
                    <option value="New">New / Mint</option>
                    <option value="Good">Good / Field-ready</option>
                    <option value="Fair">Fair / Functional</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Storage Location
                  </label>
                  <input
                    type="text"
                    value={eqLocation}
                    onChange={(e) => setEqLocation(e.target.value)}
                    placeholder="e.g. Main Warehouse, Bay 2"
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
              </div>

              {/* Included Accessories */}
              <div>
                <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                  Included Accessories (comma separated)
                </label>
                <input
                  type="text"
                  value={eqAccessories}
                  onChange={(e) => setEqAccessories(e.target.value)}
                  placeholder="e.g. 2x Batteries, Dual Charger, Top Handle, Hard Case"
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '0 10px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              {/* LAW 6 ENFORCEMENT: Financial details HIDDEN for money-blind roles */}
              {isMoneyViewer && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 'var(--r-btn, 8px)',
                    background: 'var(--card2)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 'var(--t-meta, 13px)', fontWeight: 600, color: 'var(--text)' }}>
                    Commercial Pricing & Value (NPR)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 'var(--t-caption, 12px)', color: 'var(--text2)', display: 'block', marginBottom: 2 }}>
                        Daily Rental Rate (Rs.)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={eqDailyRate}
                        onChange={(e) => setEqDailyRate(e.target.value)}
                        placeholder="e.g. 3500"
                        style={{
                          width: '100%',
                          minHeight: 44,
                          padding: '0 10px',
                          borderRadius: 'var(--r-btn, 8px)',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 'var(--t-caption, 12px)', color: 'var(--text2)', display: 'block', marginBottom: 2 }}>
                        Replacement Value (Rs.)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={eqReplacementCost}
                        onChange={(e) => setEqReplacementCost(e.target.value)}
                        placeholder="e.g. 450000"
                        style={{
                          width: '100%',
                          minHeight: 44,
                          padding: '0 10px',
                          borderRadius: 'var(--r-btn, 8px)',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </form>
          ) : (
            /* Expense Form */
            <form id={formId} onSubmit={handleSaveExpense} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                  Expense Title / Payee *
                </label>
                <input
                  type="text"
                  value={expTitle}
                  onChange={(e) => {
                    setExpTitle(e.target.value)
                    if (errors.expTitle) setErrors((prev) => ({ ...prev, expTitle: '' }))
                  }}
                  placeholder="e.g. Cable replacement at New Road"
                  autoFocus
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: `1px solid ${errors.expTitle ? 'var(--danger, #dc2626)' : 'var(--border)'}`,
                    background: 'var(--card)',
                    color: 'var(--text)',
                  }}
                />
                {errors.expTitle && (
                  <div style={{ color: 'var(--danger, #dc2626)', fontSize: 'var(--t-caption, 12px)', marginTop: 4 }}>
                    {errors.expTitle}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Amount (NPR) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={expAmount}
                    onChange={(e) => {
                      setExpAmount(e.target.value)
                      if (errors.expAmount) setErrors((prev) => ({ ...prev, expAmount: '' }))
                    }}
                    placeholder="Rs. Amount"
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: `1px solid ${errors.expAmount ? 'var(--danger, #dc2626)' : 'var(--border)'}`,
                      background: 'var(--card)',
                      color: 'var(--text)',
                    }}
                  />
                  {errors.expAmount && (
                    <div style={{ color: 'var(--danger, #dc2626)', fontSize: 'var(--t-caption, 12px)', marginTop: 4 }}>
                      {errors.expAmount}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Category
                  </label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-btn, 8px)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                    }}
                  >
                    <option value="Maintenance">Maintenance & Repairs</option>
                    <option value="Transport">Transport & Fuel</option>
                    <option value="Packaging">Consumables & Packaging</option>
                    <option value="Utilities">Office & Utilities</option>
                    <option value="SubRental">Sub-rental Expense</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                  Date
                </label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '0 10px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                  Notes & Bill Reference
                </label>
                <textarea
                  rows={3}
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="Receipt number, vendor, or notes"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--card2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <Button variant="ghost" onClick={handleRequestClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="check"
            onClick={isEquipment ? handleSaveEquipment : handleSaveExpense}
            disabled={loading}
          >
            {loading ? 'Saving…' : isEquipment ? 'Add Equipment' : 'Record Expense'}
          </Button>
        </div>
      </aside>

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <Modal
          isOpen={true}
          onClose={() => setShowDiscardConfirm(false)}
          title="Discard Unsaved Changes?"
          size="sm"
        >
          <p style={{ margin: '0 0 16px', color: 'var(--text2)', fontSize: 'var(--t-body, 14px)' }}>
            You have unsaved changes in this drawer. Are you sure you want to discard them?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>
              Keep Editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setShowDiscardConfirm(false)
                onClose()
              }}
            >
              Discard Changes
            </Button>
          </div>
        </Modal>
      )}
    </div>,
    document.body
  )
}
