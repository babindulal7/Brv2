import { useState } from 'react'
import { PageHeader, Button, Rail } from '../../components/ui/Page'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { EmptyState } from '../../components/ui/StateViews'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { IconSearch, IconChevronRight, IconArrowLeft } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../components/ui/Toast'

// Simulating the Inventory models for the left pane
const INVENTORY_MODELS = [
  { id: 'M-1', category: 'Camera', name: 'RED Komodo X Brain', stock: 3, available: 1, reserved: 1, rent: 1 },
  { id: 'M-2', category: 'Lens', name: 'DZOFilm Vespel Prime Set', stock: 2, available: 1, reserved: 0, rent: 1 },
  { id: 'M-3', category: 'Power', name: 'Core SWX NANO Micro 98', stock: 24, available: 16, reserved: 4, rent: 4 },
  { id: 'M-4', category: 'Audio', name: 'Shure SM7B', stock: 12, available: 8, reserved: 2, rent: 2 },
  { id: 'M-5', category: 'Audio', name: 'RodeCaster Pro II', stock: 4, available: 2, reserved: 1, rent: 1 },
]

interface BundleLine {
  id: string
  modelId: string
  modelName: string
  category: string
  requiredQty: number
  originalRate: Paisa
  discountType: 'percentage' | 'fixed'
  discountValue: number
  bundlePrice: Paisa
}

export function AddBundle() {
  const navigate = useNavigate()
  const { showSuccessToast } = useToast()

  const [bundleName, setBundleName] = useState('')
  const [primaryCategory, setPrimaryCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  
  const [lines, setLines] = useState<BundleLine[]>([])

  const handleAddLine = (modelId: string) => {
    const model = INVENTORY_MODELS.find(m => m.id === modelId)
    if (!model) return

    // Prevent duplicates for simplicity, just bump qty if already exists
    const existing = lines.find(l => l.modelId === modelId)
    if (existing) {
      setLines(lines.map(l => l.modelId === modelId ? { ...l, requiredQty: l.requiredQty + 1 } : l))
      return
    }

    const defaultRate = rupees(5000) // Dummy rate
    setLines([...lines, {
      id: Math.random().toString(),
      modelId,
      modelName: model.name,
      category: model.category,
      requiredQty: 1,
      originalRate: defaultRate,
      discountType: 'percentage',
      discountValue: 0,
      bundlePrice: defaultRate
    }])
  }

  const handleUpdateLine = (id: string, updates: Partial<BundleLine>) => {
    setLines(lines.map(l => l.id === id ? { ...l, ...updates } : l))
  }

  const handleRemoveLine = (id: string) => {
    setLines(lines.filter(l => l.id !== id))
  }

  const sumOriginal = lines.reduce((sum, l) => sum + (l.originalRate * l.requiredQty), 0)
  const sumBundle = lines.reduce((sum, l) => sum + l.bundlePrice, 0)
  const totalItems = lines.reduce((sum, l) => sum + l.requiredQty, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: -10 }}>
        <button 
          onClick={() => navigate(-1)}
          style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}
        >
          <IconArrowLeft size={20} />
        </button>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Inventory <IconChevronRight size={12} style={{ margin: '0 4px', verticalAlign: 'middle' }} /> Bundles <IconChevronRight size={12} style={{ margin: '0 4px', verticalAlign: 'middle' }} /> <span style={{ color: 'var(--text)' }}>New Bundle</span>
        </div>
      </div>
      
      <PageHeader
        title="New Bundle"
        icon="plus"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary">Import Template</Button>
            <Button variant="secondary">Duplicate Existing</Button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <Card padding="lg">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>1. Bundle Details</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>Bundle Name *</label>
                <Input value={bundleName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBundleName(e.target.value)} placeholder="e.g. RED Komodo X - Indie Package" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>Bundle ID</label>
                <Input value="BND-00024" disabled style={{ background: 'var(--bg)' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8 }}>Primary Category *</label>
                <Select value={primaryCategory} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPrimaryCategory(e.target.value)}>
                  <option value="">Select Category</option>
                  <option value="Camera">Camera</option>
                  <option value="Lens">Lens</option>
                  <option value="Lighting">Lighting</option>
                  <option value="Audio">Audio</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
            </div>
          </Card>

          <Card padding="none">
            <div style={{ padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>2. Bundle Builder</h3>
            </div>
            
            <div style={{ display: 'flex', height: 400 }}>
              {/* Left Pane: Inventory Tree */}
              <div style={{ width: 300, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                  <Input 
                    placeholder="Search Inventory..." 
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                    icon={<IconSearch size={14} />}
                  />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                  {INVENTORY_MODELS.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).map(model => (
                    <div 
                      key={model.id}
                      onClick={() => handleAddLine(model.id)}
                      style={{ 
                        padding: 10, 
                        borderRadius: 6, 
                        cursor: 'pointer',
                        marginBottom: 4,
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        transition: 'border-color 0.15s ease'
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{model.name}</div>
                      <div className="figure" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 8 }}>
                        <span>Stk {model.stock}</span>
                        <span style={{ color: 'var(--good)' }}>Avl {model.available}</span>
                        <span>Res {model.reserved}</span>
                        <span>Rnt {model.rent}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Pane: Selected Lines */}
              <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                {lines.length === 0 ? (
                  <EmptyState 
                    title="No items in bundle"
                    description="Select models from the inventory tree to add them to this bundle."
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {lines.map(line => (
                      <div key={line.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{line.modelName}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{line.category}</div>
                          </div>
                          <button onClick={() => handleRemoveLine(line.id)} style={{ background: 'none', border: 'none', color: 'var(--bad)', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
                            Remove
                          </button>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Req. Qty</label>
                            <Input 
                              type="number" 
                              value={line.requiredQty.toString()} 
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateLine(line.id, { requiredQty: parseInt(e.target.value) || 1 })} 
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Orig. Rate / Unit</label>
                            <div className="figure" style={{ fontSize: 13, padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                              {formatMoney(line.originalRate)}
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Bundle Rate / Unit</label>
                            <Input 
                              type="number" 
                              value={((line.bundlePrice as unknown as number) / 100).toString()} 
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateLine(line.id, { bundlePrice: rupees(parseFloat(e.target.value) || 0) })} 
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <Rail width={300}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            <Card padding="md">
              <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 16 }}>Bundle Summary</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total Items</span>
                <span className="figure" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{totalItems}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Equipment</span>
                <span className="figure" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{totalItems}</span>
              </div>
            </Card>

            <Card padding="md">
              <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 16 }}>Pricing Summary</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Sum of Parts</span>
                <span className="figure" style={{ fontSize: 13, color: 'var(--text)' }}>{formatMoney(rupees((sumOriginal as unknown as number) / 100))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Bundle Rate</span>
                <span className="figure" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{formatMoney(rupees((sumBundle as unknown as number) / 100))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--good)', fontWeight: 500 }}>Saving</span>
                <span className="figure" style={{ fontSize: 13, color: 'var(--good)', fontWeight: 600 }}>
                  {formatMoney(rupees((sumOriginal as unknown as number) - (sumBundle as unknown as number)))}
                </span>
              </div>
            </Card>
          </div>
        </Rail>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="secondary">Save Draft</Button>
          <Button 
            variant="primary" 
            onClick={() => {
              showSuccessToast('Bundle Created', 'BND-00024 saved successfully')
              navigate(-1)
            }}
          >
            Create Bundle
          </Button>
        </div>
      </div>
    </div>
  )
}
