import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { useToast } from '../../components/ui/Toast'
import { parseMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import type { ClientRecord, ClientType, MembershipTier } from '../../data/clients'

interface AddClientModalProps {
  isOpen: boolean
  onClose: () => void
  onClientAdded: (client: ClientRecord) => void
}

const CLIENT_TYPES = [
  { value: 'Production Company', label: 'Production Company' },
  { value: 'Educational Institution', label: 'Educational Institution' },
  { value: 'Freelancer', label: 'Freelancer' },
  { value: 'Broadcaster', label: 'Broadcaster' },
  { value: 'Individual', label: 'Individual' },
  { value: 'Government', label: 'Government' },
  { value: 'NGO', label: 'NGO' },
]

const MEMBERSHIP_TIERS = [
  { value: 'Creator', label: 'Creator Tier' },
  { value: 'Academy', label: 'Academy (Student / Educational)' },
  { value: 'Cinematographer', label: 'Cinematographer Pro' },
  { value: 'Production Alliance', label: 'Production Alliance' },
  { value: 'Elite', label: 'Elite Partner' },
]

export function AddClientModal({ isOpen, onClose, onClientAdded }: AddClientModalProps) {
  const { showSuccessToast } = useToast()
  /**
   * §8.3 — the credit-limit field is a rupee field. For a role that may not see
   * money it is **absent from the form**, and the new client starts on the plan
   * default (Rs 0) until someone who may set a limit sets one.
   */
  const money = useCanViewMoney()

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [clientType, setClientType] = useState<ClientType>('Production Company')
  const [membership, setMembership] = useState<MembershipTier>('Creator')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pan, setPan] = useState('')
  const [address, setAddress] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactDesignation, setContactDesignation] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [creditLimit, setCreditLimit] = useState('1,00,000')
  const [isVip, setIsVip] = useState(false)
  const [isVerified, setIsVerified] = useState(false)

  // Persistent inline validation errors
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  const validate = () => {
    const errs: Record<string, string | null> = {}
    if (!name.trim()) errs.name = 'Client or Organization name is required'
    if (!phone.trim()) errs.phone = 'Primary phone number is required'
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Enter a valid email address'
    }
    if (pan.trim() && !/^\d{9}$/.test(pan.trim())) {
      errs.pan = 'Nepal PAN must be exactly 9 numeric digits'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const parsedCredit = money ? (parseMoney(creditLimit) ?? rupees(100000)) : rupees(0)

    const newRecord: ClientRecord = {
      id: `CL-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      name: name.trim(),
      ...(company.trim() ? { company: company.trim() } : {}),
      clientType,
      membership,
      phone: phone.trim(),
      email: email.trim(),
      ...(pan.trim() ? { pan: pan.trim() } : {}),
      isVip,
      isVerified,
      isBlocked: false,
      currentRentalsCount: 0,
      activeBookings: [],
      outstandingPaisa: rupees(0),
      depositHeldPaisa: rupees(0),
      creditLimitPaisa: parsedCredit,
      creditUsedPaisa: rupees(0),
      lastRentalAd: '—',
      lastRentalBs: '—',
      address: address.trim() || 'Kathmandu, Nepal',
      contactPerson: {
        name: contactName.trim() || name.trim(),
        designation: contactDesignation.trim() || 'Representative',
        phone: contactPhone.trim() || phone.trim(),
      },
      kycStatus: isVerified ? 'Verified' : 'Pending Review',
      kycDocsCount: isVerified ? 2 : 0,
      totalRentalsCount: 0,
      totalSpentPaisa: rupees(0),
    }

    onClientAdded(newRecord)
    showSuccessToast('Client Registered', `Created profile for ${newRecord.name}`)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Client"
      subtitle={
        money
          ? 'Create a client profile, set membership tier, assign credit limits, and capture KYC documentation.'
          : 'Create a client profile, set membership tier, and capture KYC documentation.'
      }
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, width: '100%' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Create Client Profile
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Row 1: Type & Membership */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Select
            label="Client Type"
            value={clientType}
            onChange={(e) => setClientType(e.target.value as ClientType)}
            options={CLIENT_TYPES}
          />
          <Select
            label="Membership Tier"
            value={membership}
            onChange={(e) => setMembership(e.target.value as MembershipTier)}
            options={MEMBERSHIP_TIERS}
          />
        </div>

        {/* Row 2: Name & Company */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Input
            label="Client / Account Name"
            placeholder="e.g. Kathmandu Cinema Works"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (errors.name) setErrors({ ...errors, name: null })
            }}
            error={errors.name ?? null}
            required
          />
          <Input
            label="Registered Company Name (Optional)"
            placeholder="e.g. KCW Studios Pvt. Ltd."
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>

        {/* Row 3: Phone & Email */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Input
            label="Primary Phone Number"
            placeholder="+977 980-1234567"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              if (errors.phone) setErrors({ ...errors, phone: null })
            }}
            error={errors.phone ?? null}
            required
          />
          <Input
            label="Email Address"
            placeholder="client@company.com.np"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (errors.email) setErrors({ ...errors, email: null })
            }}
            error={errors.email ?? null}
          />
        </div>

        {/* Row 4: PAN & Credit Limit — the limit is absent for a money-blind role. */}
        <div style={{ display: 'grid', gridTemplateColumns: money ? '1fr 1fr' : '1fr', gap: 16 }}>
          <Input
            label="PAN Number (9 Digits)"
            placeholder="601928473"
            value={pan}
            onChange={(e) => {
              setPan(e.target.value)
              if (errors.pan) setErrors({ ...errors, pan: null })
            }}
            error={errors.pan ?? null}
          />
          {money && (
            <Input
              label="Approved Credit Limit (Rs)"
              placeholder="1,00,000"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
            />
          )}
        </div>

        {/* Row 5: Physical Address */}
        <Input
          label="Physical / Billing Address"
          placeholder="e.g. Baluwatar, Kathmandu, Ward 4"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        {/* Section: Contact Person */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Authorized Contact Person
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Input
              label="Contact Name"
              placeholder="e.g. Aarav Shrestha"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <Input
              label="Designation"
              placeholder="e.g. Line Producer"
              value={contactDesignation}
              onChange={(e) => setContactDesignation(e.target.value)}
            />
            <Input
              label="Direct Mobile"
              placeholder="+977 980-0000000"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
        </div>

        {/* Toggles */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            padding: '12px 16px',
            background: 'var(--card2)',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={isVip}
              onChange={(e) => setIsVip(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--nav-active-accent)' }}
            />
            <span>VIP Client Priority</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={isVerified}
              onChange={(e) => setIsVerified(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--nav-active-accent)' }}
            />
            <span>KYC Documents Verified</span>
          </label>
        </div>
      </form>
    </Modal>
  )
}
