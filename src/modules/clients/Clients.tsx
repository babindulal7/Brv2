import { useState } from 'react'
import { ClientsDirectory } from './ClientsDirectory'
import Membership from './Membership'
import { Card } from '../../components/ui/Card'
import { Button, PageHeader } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'
import { formatMoney, rupees } from '../../lib/money'

type ClientTab = 'all' | 'membership' | 'referral' | 'credit'

export default function Clients() {
  const [activeTab, setActiveTab] = useState<ClientTab>('all')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Clients"
        description="Manage your clients, memberships, referrals and credit"
        actions={
          <>
            <Button variant="secondary" icon="upload">Import</Button>
            <Button variant="secondary" icon="download">Export</Button>
            <Button variant="primary" icon="plus">New Client</Button>
          </>
        }
      />

      {/* Header Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'all' ? 'var(--card2)' : 'transparent',
              color: activeTab === 'all' ? 'var(--text)' : 'var(--muted)',
              borderBottom: activeTab === 'all' ? '2px solid var(--nav-active-accent)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            All Clients
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('membership')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'membership' ? 'var(--card2)' : 'transparent',
              color: activeTab === 'membership' ? 'var(--text)' : 'var(--muted)',
              borderBottom: activeTab === 'membership' ? '2px solid var(--nav-active-accent)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            Membership
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('referral')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'referral' ? 'var(--card2)' : 'transparent',
              color: activeTab === 'referral' ? 'var(--text)' : 'var(--muted)',
              borderBottom: activeTab === 'referral' ? '2px solid var(--nav-active-accent)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            Referral
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('credit')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'credit' ? 'var(--card2)' : 'transparent',
              color: activeTab === 'credit' ? 'var(--text)' : 'var(--muted)',
              borderBottom: activeTab === 'credit' ? '2px solid var(--nav-active-accent)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            Credit
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'all' && <ClientsDirectory />}
      {activeTab === 'membership' && <Membership />}
      {activeTab === 'referral' && <ReferralView />}
      {activeTab === 'credit' && <CreditRiskView />}
    </div>
  )
}

function ReferralView() {
  const { showSuccessToast } = useToast()

  const REFERRALS = [
    {
      referrer: 'Kathmandu Cinema Works',
      code: 'KCW-PRO-26',
      referredClient: 'Shine Pictures Nepal',
      date: '14 Jestha 2083',
      rewardPaisa: rupees(5000),
      status: 'Credited to Ledger',
    },
    {
      referrer: 'Bikram Rai',
      code: 'BIKRAM-DOP',
      referredClient: 'Sushil Lama Visuals',
      date: '28 Baishakh 2083',
      rewardPaisa: rupees(3500),
      status: 'Credited to Ledger',
    },
    {
      referrer: 'Himalayan Mountain Media',
      code: 'HIMALAYA-VIP',
      referredClient: 'Red Dot Films',
      date: '02 Jestha 2083',
      rewardPaisa: rupees(10000),
      status: 'Awaiting First Rental Return',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Active Referrers
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            42
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Clients with referral links
          </span>
        </Card>

        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Converted Bookings
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--good)', marginTop: 4 }}>
            38
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Generated from referrals
          </span>
        </Card>

        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Total Credits Issued
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            Rs 1,45,000
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Applied against rental invoices
          </span>
        </Card>

        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Referral Revenue
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--info)', marginTop: 4 }}>
            Rs 18,50,000
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Direct attributed rental volume
          </span>
        </Card>
      </div>

      <Card padding="md">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Recent Referral Conversions & Affiliate Rewards
          </h3>
          <Button
            variant="secondary"
            onClick={() => showSuccessToast('Voucher Created', 'Generated new referral voucher code')}
          >
            Generate Referral Code
          </Button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
              <th style={{ padding: '10px 12px' }}>Referrer Client</th>
              <th style={{ padding: '10px 12px' }}>Referral Code</th>
              <th style={{ padding: '10px 12px' }}>New Referred Account</th>
              <th style={{ padding: '10px 12px' }}>Date</th>
              <th style={{ padding: '10px 12px' }}>Credit Reward</th>
              <th style={{ padding: '10px 12px' }}>Reward Status</th>
            </tr>
          </thead>
          <tbody>
            {REFERRALS.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>{r.referrer}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span className="figure" style={{ padding: '2px 6px', background: 'var(--card2)', borderRadius: 4, border: '1px solid var(--border)' }}>
                    {r.code}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{r.referredClient}</td>
                <td style={{ padding: '10px 12px', color: 'var(--muted)' }} className="figure">{r.date}</td>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--good)' }} className="figure">
                  {formatMoney(r.rewardPaisa)}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: r.status.includes('Credited') ? 'var(--good)' : 'var(--warn)' }}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function CreditRiskView() {
  const { showSuccessToast } = useToast()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Total Credit Extended
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
            Rs 48,00,000
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Approved limits across 54 accounts
          </span>
        </Card>

        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Credit Utilized
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--info)', marginTop: 4 }}>
            Rs 18,42,000
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            38.3% exposure ratio
          </span>
        </Card>

        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Overdue Balance (&gt;30d)
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--bad)', marginTop: 4 }}>
            Rs 2,32,500
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            4 accounts requiring follow-up
          </span>
        </Card>

        <Card padding="md">
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Manager Overrides
          </span>
          <div className="figure" style={{ fontSize: 26, fontWeight: 700, color: 'var(--warn)', marginTop: 4 }}>
            3
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            Special credit limits active
          </span>
        </Card>
      </div>

      <Card padding="md">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              Credit Policy by Membership Tier (Derived Rule)
            </h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
              Credit limits derive automatically from membership plan. Overrides require Manager authorization (&ge;10 char reason) written to immutable audit.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => showSuccessToast('Manager Authorization', 'Opening Manager Credit Override authorization gate…')}
          >
            Request Override
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { tier: 'Academy', defaultLimit: 'Rs 0', discount: '10%', approval: 'Default' },
            { tier: 'Creator', defaultLimit: 'Rs 0', discount: '15%', approval: 'Default' },
            { tier: 'Cinematographer', defaultLimit: 'Rs 1,00,000', discount: '18%', approval: 'KYC Verified' },
            { tier: 'Production Alliance', defaultLimit: 'Rs 2,50,000', discount: '20%', approval: 'Company PAN' },
            { tier: 'Elite', defaultLimit: 'Rs 5,00,000', discount: '22%', approval: 'Director Approval' },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'var(--card2)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{item.tier}</div>
              <div className="figure" style={{ fontSize: 16, fontWeight: 700, color: 'var(--nav-active-accent)' }}>
                {item.defaultLimit}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Discount: <span className="figure">{item.discount}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--good)', fontWeight: 600 }}>
                {item.approval}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
