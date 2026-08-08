import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, Rail, SideRail } from '../../components/ui/Page'
import { useAuth } from '../../lib/auth'
import { rupees, formatMoney } from '../../lib/money'
import { WAREHOUSES } from '../../data/warehouse'

type TrackingMode = 'Serialised' | 'Quantity' | 'Consumable'
type Condition = 'Excellent' | 'Good' | 'Fair' | 'Damaged' | 'Lost'

interface UnitDraft {
  id: string
  serial: string
  assetTag: string
  condition: Condition
  location: string
  notes?: string
}

interface AccessoryDraft {
  id: string
  name: string
  quantity: number
  required: boolean
}

export default function AddEquipment() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isFloorRole = user?.role === ('technician' as any)

  // Section 1: Identity
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [assetCode] = useState('EQ000245')
  const [category, setCategory] = useState('Camera')
  const [brand, setBrand] = useState('Sony')
  const [modelNo, setModelNo] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  // Section 2: Stock & Units
  const [tracking, setTracking] = useState<TrackingMode>('Serialised')
  const [quantity, setQuantity] = useState(1)
  const [minStockAlert, setMinStockAlert] = useState(2)
  const [units, setUnits] = useState<UnitDraft[]>([
    { id: 'u-1', serial: 'SN-FX3-006', assetTag: 'EQ000245-01', condition: 'Excellent', location: 'Rack 01 · Shelf 02' },
  ])
  const [childAccessories, setChildAccessories] = useState<AccessoryDraft[]>([
    { id: 'ca-1', name: 'Body Cap & Sensor Protector', quantity: 1, required: true },
    { id: 'ca-2', name: 'XLR Top Handle Unit', quantity: 1, required: true },
    { id: 'ca-3', name: 'NP-FZ100 Battery', quantity: 2, required: true },
  ])

  // Section 3: Relationships
  const [storedInContainer, setStoredInContainer] = useState('None (Direct Shelf)')
  const [compatibleWith] = useState<string[]>(['Sony E-Mount Lenses', 'Sony NP-FZ100 Batteries', 'DJI RS3 Pro Gimbal'])

  // Section 4: Location
  const [selectedWarehouse, setSelectedWarehouse] = useState('wh-01')
  const [selectedRoom, setSelectedRoom] = useState('Camera Vault A')
  const [selectedZone, setSelectedZone] = useState('Zone A (Cinema Bodies)')
  const [selectedRack, setSelectedRack] = useState('Rack 01')
  const [selectedShelf, setSelectedShelf] = useState('Shelf 02')
  const [selectedBin, setSelectedBin] = useState('Bin A-1')

  // Section 5: Purchase (Money Gated)
  const [purchaseDateAD, setPurchaseDateAD] = useState('2026-08-06')
  const [purchaseDateBS, setPurchaseDateBS] = useState('2083-04-22')
  const [supplier, setSupplier] = useState('Camera Zone Nepal')
  const [purchasePrice, setPurchasePrice] = useState(465000)
  const [replacementValue, setReplacementValue] = useState(465000)
  const [warrantyMonths, setWarrantyMonths] = useState(24)
  const [__isInsured, __setIsInsured] = useState(true)
  const [__insuranceProvider, __setInsuranceProvider] = useState('Sagarmatha Insurance Co')

  // Section 6: Pricing & Rental (Money Gated)
  const [dailyRate, setDailyRate] = useState(4500)
  const [weeklyRate, setWeeklyRate] = useState(22500)
  const [monthlyRate, setMonthlyRate] = useState(75000)
  const [securityDeposit, setSecurityDeposit] = useState(25000)
  const [minRentalDays, setMinRentalDays] = useState(1)
  const [cleaningTimeMinutes, setCleaningTimeMinutes] = useState(30)

  // Section 7: Maintenance
  const [inspectionIntervalDays, setInspectionIntervalDays] = useState(30)
  const [maintenanceCycleRentals, setMaintenanceCycleRentals] = useState(20)
  const [internalNotes, setInternalNotes] = useState('')

  // Active section for sticky scroll
  const [activeSection, setActiveSection] = useState('sec-identity')
  const [isSaved, setIsSaved] = useState(false)

  // Validation completeness calculation
  const isIdentityComplete = Boolean(name.trim() && category && brand)
  const isStockComplete = tracking === 'Serialised' ? units.length > 0 && units.every(u => u.serial.trim()) : quantity > 0
  const isLocationComplete = Boolean(selectedWarehouse && selectedZone)
  const isPurchaseComplete = purchasePrice > 0 && replacementValue > 0
  const isPricingComplete = dailyRate > 0

  void (isIdentityComplete && isStockComplete && isLocationComplete && (isFloorRole || (isPurchaseComplete && isPricingComplete)))

  const handleAddUnit = () => {
    const nextIdx = units.length + 1
    const pad = String(nextIdx).padStart(2, '0')
    setUnits(prev => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        serial: ``,
        assetTag: `${assetCode}-${pad}`,
        condition: 'Excellent',
        location: `${selectedRack} · ${selectedShelf}`,
      },
    ])
  }

  const handleRemoveUnit = (id: string) => {
    if (units.length <= 1) return
    setUnits(prev => prev.filter(u => u.id !== id))
  }

  const handleAutoGenerateTags = () => {
    setUnits(prev =>
      prev.map((u, i) => ({
        ...u,
        assetTag: `${assetCode}-${String(i + 1).padStart(2, '0')}`,
      }))
    )
  }

  const handleSave = () => {
    setIsSaved(true)
    setTimeout(() => {
      navigate('/inventory')
    }, 1200)
  }

  const sections = [
    { id: 'sec-identity', label: '1. Identity', complete: isIdentityComplete },
    { id: 'sec-stock', label: '2. Stock & Units', complete: isStockComplete },
    { id: 'sec-relationships', label: '3. Relationships', complete: true },
    { id: 'sec-location', label: '4. Location', complete: isLocationComplete },
    ...(!isFloorRole ? [
      { id: 'sec-purchase', label: '5. Purchase & Value', complete: isPurchaseComplete },
      { id: 'sec-pricing', label: '6. Pricing & Rental', complete: isPricingComplete },
    ] : []),
    { id: 'sec-maintenance', label: isFloorRole ? '5. Maintenance & Notes' : '7. Maintenance & Notes', complete: true },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1400, margin: '0 auto', paddingBottom: 60 }}>
      {/* Breadcrumb & Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <Link to="/inventory" style={{ color: 'var(--text2)', textDecoration: 'none' }}>Inventory</Link>
          <span>›</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>Add Equipment</span>
          <span
            className="identifier"
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              fontSize: 'var(--t-th)',
              color: 'var(--nav-active-accent)',
            }}
          >
            {assetCode}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="ghost" onClick={() => navigate('/inventory')}>Cancel</Button>
          <Button variant="secondary" onClick={() => handleSave()}>Save Draft</Button>
          <Button
            variant="primary"
            icon="check"
            disabled={!isIdentityComplete || !isStockComplete}
            onClick={() => handleSave()}
          >
            {isSaved ? 'Equipment Added!' : 'Add to Fleet'}
          </Button>
        </div>
      </div>

      {/* Main Grid: Sticky Nav (Left) | Main Form (Center) | Intelligence Rail (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 20, alignItems: 'start' }}>

        {/* Left Sticky Section Navigation */}
        <aside style={{ position: 'sticky', top: 20 }}>
          <SideRail width={200} label="Steps">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 'var(--t-th)', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, paddingLeft: 8 }}>
                Sections
              </span>
              {sections.map(sec => {
                const isActive = activeSection === sec.id
                return (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    onClick={() => setActiveSection(sec.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 6,
                      textDecoration: 'none',
                      fontSize: 'var(--t-meta)',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--text)' : 'var(--text2)',
                      background: isActive ? 'var(--card2)' : 'transparent',
                      border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{sec.label}</span>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: sec.complete ? 'var(--success-text)' : 'var(--border)',
                      }}
                    />
                  </a>
                )
              })}

              <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Three-Level Model</div>
                <div>Fleet Item › Unit › Child Accessory</div>
              </div>
            </div>
          </SideRail>
        </aside>

        {/* Center Form Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          
          {/* 1. Identity */}
          <section id="sec-identity">
            <Card title="1. Equipment Identity">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Full Equipment Name <span style={{ color: 'var(--danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sony FX3 Cinema Camera Body"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 12px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-ui)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Short Display Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sony FX3"
                    value={shortName}
                    onChange={e => setShortName(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Asset Code (Auto SKU)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={assetCode}
                    className="identifier"
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--nav-active-accent)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Category <span style={{ color: 'var(--danger-text)' }}>*</span>
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  >
                    {['Camera', 'Lens', 'Lighting', 'Audio', 'Grip', 'Power', 'Support', 'Drone', 'Accessory', 'Consumable'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Brand / Manufacturer <span style={{ color: 'var(--danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sony, RED, ARRI, Aputure"
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Manufacturer Model Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ILME-FX3"
                    value={modelNo}
                    onChange={e => setModelNo(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Product Image URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Description & Specifications
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Full-frame 4K 120p cinema camera, dual base ISO 800/12800, S-Cinetone color profile..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>
            </Card>
          </section>

          {/* 2. Stock & Units */}
          <section id="sec-stock">
            <Card
              title="2. Stock & Tracking Mode"
              action={
                tracking === 'Serialised' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button variant="ghost" onClick={handleAutoGenerateTags}>Generate Asset Tags</Button>
                    <Button variant="secondary" icon="plus" onClick={handleAddUnit}>Add Unit</Button>
                  </div>
                )
              }
            >
              {/* Tracking Mode Segmented Control */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[
                  { mode: 'Serialised' as const, label: 'Serialised Units', desc: 'Each item has a unique serial number (Cameras, Lenses, Lights)' },
                  { mode: 'Quantity' as const, label: 'Bulk Quantity', desc: 'Tracked by bulk count only (Cables, Adapters, Sandbags)' },
                  { mode: 'Consumable' as const, label: 'Consumable', desc: 'Used up and not returned (Gaffer Tape, Batteries, Fog Fluid)' },
                ].map(item => {
                  const active = tracking === item.mode
                  return (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => setTracking(item.mode)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1px solid ${active ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                        background: active ? 'var(--card2)' : 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                      }}
                    >
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: active ? 'var(--nav-active-accent)' : 'var(--text)' }}>
                        {item.label}
                      </span>
                      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                        {item.desc}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Serialised Units Table */}
              {tracking === 'Serialised' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                        <th style={{ padding: '6px 8px', width: 40 }}>#</th>
                        <th style={{ padding: '6px 8px' }}>Manufacturer Serial <span style={{ color: 'var(--danger-text)' }}>*</span></th>
                        <th style={{ padding: '6px 8px' }}>Asset Tag (Auto)</th>
                        <th style={{ padding: '6px 8px', width: 140 }}>Intake Condition</th>
                        <th style={{ padding: '6px 8px', width: 100 }}>Status</th>
                        <th style={{ padding: '6px 8px', width: 40 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u, i) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 8px', color: 'var(--muted)' }}>{i + 1}</td>
                          <td style={{ padding: '8px 8px' }}>
                            <input
                              type="text"
                              placeholder="e.g. SN-FX3-006"
                              className="identifier"
                              value={u.serial}
                              onChange={e => {
                                const val = e.target.value
                                setUnits(prev => prev.map(item => item.id === u.id ? { ...item, serial: val } : item))
                              }}
                              style={{
                                width: '100%',
                                height: 32,
                                padding: '0 8px',
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                background: 'var(--card2)',
                                color: 'var(--text)',
                                fontSize: 'var(--t-meta)',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 8px' }}>
                            <span className="identifier" style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                              {u.assetTag}
                            </span>
                          </td>
                          <td style={{ padding: '8px 8px' }}>
                            <select
                              value={u.condition}
                              onChange={e => {
                                const cond = e.target.value as Condition
                                setUnits(prev => prev.map(item => item.id === u.id ? { ...item, condition: cond } : item))
                              }}
                              style={{
                                width: '100%',
                                height: 30,
                                padding: '0 6px',
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                background: 'var(--card2)',
                                color: 'var(--text)',
                                fontSize: 'var(--t-meta)',
                              }}
                            >
                              {['Excellent', 'Good', 'Fair', 'Damaged', 'Lost'].map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '8px 8px' }}>
                            <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--success-text)' }}>
                              In Stock
                            </span>
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                            {units.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveUnit(u.id)}
                                style={{ border: 'none', background: 'transparent', color: 'var(--danger-text)', cursor: 'pointer' }}
                              >
                                <Icon name="close" size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Child Accessories (Checklist on packing/return) */}
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                        Child Accessories (Packing & Return Checklist Items — never scanned separately)
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setChildAccessories(prev => [
                            ...prev,
                            { id: `ca-${Date.now()}`, name: 'New Accessory', quantity: 1, required: true },
                          ])
                        }}
                      >
                        + Add Accessory
                      </Button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {childAccessories.map(ca => (
                        <span
                          key={ca.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            fontSize: 'var(--t-meta)',
                          }}
                        >
                          <Icon name="checklist" size={12} style={{ color: 'var(--nav-active-accent)' }} />
                          <span>{ca.name} (x{ca.quantity})</span>
                          <button
                            type="button"
                            onClick={() => setChildAccessories(prev => prev.filter(item => item.id !== ca.id))}
                            style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Initial Stock Quantity <span style={{ color: 'var(--danger-text)' }}>*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={e => setQuantity(Number(e.target.value))}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Low Stock Threshold Alert
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={minStockAlert}
                      onChange={e => setMinStockAlert(Number(e.target.value))}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>
                </div>
              )}
            </Card>
          </section>

          {/* 3. Relationships */}
          <section id="sec-relationships">
            <Card title="3. Relationships & Containment">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Stored In (Parent Case / Flight Container)
                  </label>
                  <select
                    value={storedInContainer}
                    onChange={e => setStoredInContainer(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  >
                    <option value="None (Direct Shelf)">None (Direct Shelf)</option>
                    <option value="CASE-FX3-PELICAN (Pelican 1510 Carry-On)">CASE-FX3-PELICAN (Pelican 1510 Carry-On)</option>
                    <option value="CASE-CINE-TRUNK-01 (Master Flight Trunk)">CASE-CINE-TRUNK-01 (Master Flight Trunk)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Kit / Bundle Membership
                  </label>
                  <div
                    style={{
                      height: 36,
                      padding: '0 12px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--muted)',
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: 'var(--t-meta)',
                    }}
                  >
                    Assigned via Bundles module (Currently in 2 Kits)
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Compatible Accessories & Equipment
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {compatibleWith.map((item, i) => (
                      <span
                        key={i}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: 'var(--card2)',
                          border: '1px solid var(--border)',
                          fontSize: 'var(--t-meta)',
                          color: 'var(--text)',
                        }}
                      >
                        <Icon name="external_link" size={12} style={{ color: 'var(--nav-active-accent)' }} />
                        <span>{item}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* 4. Location Hierarchy */}
          <section id="sec-location">
            <Card title="4. Physical Storage Location">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Warehouse <span style={{ color: 'var(--danger-text)' }}>*</span>
                  </label>
                  <select
                    value={selectedWarehouse}
                    onChange={e => setSelectedWarehouse(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  >
                    {WAREHOUSES.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Room / Vault
                  </label>
                  <input
                    type="text"
                    value={selectedRoom}
                    onChange={e => setSelectedRoom(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Storage Zone
                  </label>
                  <input
                    type="text"
                    value={selectedZone}
                    onChange={e => setSelectedZone(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Rack
                  </label>
                  <input
                    type="text"
                    value={selectedRack}
                    onChange={e => setSelectedRack(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Shelf
                  </label>
                  <input
                    type="text"
                    value={selectedShelf}
                    onChange={e => setSelectedShelf(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Bin / Slot
                  </label>
                  <input
                    type="text"
                    value={selectedBin}
                    onChange={e => setSelectedBin(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>
              </div>
            </Card>
          </section>

          {/* 5. Purchase & Financials (Omitted for Floor Roles) */}
          {!isFloorRole && (
            <section id="sec-purchase">
              <Card title="5. Purchase & Valuation (Finance Gated)">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Purchase Date (AD)
                    </label>
                    <input
                      type="date"
                      value={purchaseDateAD}
                      onChange={e => setPurchaseDateAD(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Purchase Date (BS)
                    </label>
                    <input
                      type="text"
                      value={purchaseDateBS}
                      onChange={e => setPurchaseDateBS(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Supplier
                    </label>
                    <input
                      type="text"
                      value={supplier}
                      onChange={e => setSupplier(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Purchase Price (NPR) <span style={{ color: 'var(--danger-text)' }}>*</span>
                    </label>
                    <input
                      type="number"
                      value={purchasePrice}
                      onChange={e => {
                        const val = Number(e.target.value)
                        setPurchasePrice(val)
                        if (replacementValue === purchasePrice) setReplacementValue(val)
                      }}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Replacement Value (NPR) <span style={{ color: 'var(--danger-text)' }}>*</span>
                    </label>
                    <input
                      type="number"
                      value={replacementValue}
                      onChange={e => setReplacementValue(Number(e.target.value))}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Warranty Period (Months)
                    </label>
                    <input
                      type="number"
                      value={warrantyMonths}
                      onChange={e => setWarrantyMonths(Number(e.target.value))}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* 6. Pricing & Rental Settings (Omitted for Floor Roles) */}
          {!isFloorRole && (
            <section id="sec-pricing">
              <Card title="6. Rental Pricing Rates">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Daily Rate (NPR) <span style={{ color: 'var(--danger-text)' }}>*</span>
                    </label>
                    <input
                      type="number"
                      value={dailyRate}
                      onChange={e => {
                        const val = Number(e.target.value)
                        setDailyRate(val)
                        setWeeklyRate(val * 5)
                        setMonthlyRate(val * 16)
                      }}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Weekly Rate (5x Day)
                    </label>
                    <input
                      type="number"
                      value={weeklyRate}
                      onChange={e => setWeeklyRate(Number(e.target.value))}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Monthly Rate (16x Day)
                    </label>
                    <input
                      type="number"
                      value={monthlyRate}
                      onChange={e => setMonthlyRate(Number(e.target.value))}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Security Deposit (NPR)
                    </label>
                    <input
                      type="number"
                      value={securityDeposit}
                      onChange={e => setSecurityDeposit(Number(e.target.value))}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Minimum Rental Days
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={minRentalDays}
                      onChange={e => setMinRentalDays(Number(e.target.value))}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                      Cleaning / Prep Time (Mins)
                    </label>
                    <input
                      type="number"
                      value={cleaningTimeMinutes}
                      onChange={e => setCleaningTimeMinutes(Number(e.target.value))}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        borderRadius: 'var(--r-input)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* 7. Maintenance & Notes */}
          <section id="sec-maintenance">
            <Card title="7. Maintenance & Internal Notes">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Inspection Interval (Days)
                  </label>
                  <input
                    type="number"
                    value={inspectionIntervalDays}
                    onChange={e => setInspectionIntervalDays(Number(e.target.value))}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Maintenance Cycle (Rentals Count)
                  </label>
                  <input
                    type="number"
                    value={maintenanceCycleRentals}
                    onChange={e => setMaintenanceCycleRentals(Number(e.target.value))}
                    style={{
                      width: '100%',
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 6 }}>
                    Internal Warehouse Instructions
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Always check sensor glass under LED inspection light before packing..."
                    value={internalNotes}
                    onChange={e => setInternalNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>
            </Card>
          </section>
        </div>

        {/* Right Live Intelligence Rail */}
        <Rail width={320} label="Summary">
          {/* Quick Info & Identifiers */}
          <Card title="Quick Preview">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: 'var(--card2)',
                    border: '1px solid var(--border)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--muted)',
                  }}
                >
                  <Icon name="box" size={24} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                    {name || 'Untitled Equipment'}
                  </div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {brand} · {category}
                  </div>
                </div>
              </div>

              {/* Codes in JetBrains Mono */}
              <div style={{ padding: 10, borderRadius: 6, background: 'var(--card2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-th)' }}>
                  <span style={{ color: 'var(--muted)' }}>Asset Code (SKU):</span>
                  <span className="identifier" style={{ color: 'var(--nav-active-accent)' }}>{assetCode}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-th)' }}>
                  <span style={{ color: 'var(--muted)' }}>Units Count:</span>
                  <span className="figure" style={{ fontWeight: 600 }}>{tracking === 'Serialised' ? units.length : quantity}</span>
                </div>
                {!isFloorRole && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-th)' }}>
                    <span style={{ color: 'var(--muted)' }}>Daily Rate:</span>
                    <span className="figure" style={{ fontWeight: 700, color: 'var(--success-text)' }}>{formatMoney(rupees(dailyRate))}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Live Tree Preview */}
          <Card title="Live Equipment Hierarchy">
            <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="box" size={13} style={{ color: 'var(--nav-active-accent)' }} />
                <span>{name || 'Equipment Model'}</span>
              </div>
              {tracking === 'Serialised' && units.map(u => (
                <div key={u.id} style={{ paddingLeft: 16, borderLeft: '1px solid var(--border)', marginLeft: 6, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="identifier" style={{ color: 'var(--text)' }}>{u.serial || '(No Serial)'}</span>
                    <span style={{ color: 'var(--muted)' }}>({u.assetTag})</span>
                  </div>
                  {childAccessories.map(ca => (
                    <div key={ca.id} style={{ paddingLeft: 12, borderLeft: '1px dashed var(--border)', marginLeft: 4, marginTop: 2, color: 'var(--muted)' }}>
                      └─ {ca.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>

          {/* Ready to Rent Checklist */}
          <Card title="Ready to Rent Checklist">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--t-meta)' }}>
              {[
                { label: 'Identity fields complete', ok: isIdentityComplete },
                { label: 'Units & Serials registered', ok: isStockComplete },
                { label: 'Location allocated', ok: isLocationComplete },
                ...(!isFloorRole ? [
                  { label: 'Purchase & Replacement set', ok: isPurchaseComplete },
                  { label: 'Daily rental rate set', ok: isPricingComplete },
                ] : []),
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon
                    name={item.ok ? 'check' : 'alert_triangle'}
                    size={14}
                    style={{ color: item.ok ? 'var(--success-text)' : 'var(--muted)' }}
                  />
                  <span style={{ color: item.ok ? 'var(--text)' : 'var(--muted)' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </Rail>
      </div>
    </div>
  )
}
