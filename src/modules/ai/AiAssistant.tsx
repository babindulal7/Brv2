import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { BRAND, BRAND_TEXT } from '../../lib/status'

/**
 * **AI Assistant** — spec-derived. No render covers this screen.
 *
 * Every suggestion here names the record it came from and offers the action
 * that acts on it. An assistant that produces advice with no route to the thing
 * it is advising about is a text box, not a tool.
 *
 * Nothing on this page executes. The assistant proposes; the operator opens the
 * record and decides. That is deliberate — an AI that writes to bookings,
 * pricing or stock without a human in the loop is not something to ship by
 * default.
 */

const CAPABILITIES: Array<{ title: string; note: string; icon: 'search' | 'chart' | 'file' | 'automation' }> = [
  { title: 'Ask about your data', note: 'Bookings, stock, clients, money — in plain language', icon: 'search' },
  { title: 'Explain a number', note: 'Trace any figure back to the records behind it', icon: 'chart' },
  { title: 'Draft a document', note: 'Quotes, reminders, client messages', icon: 'file' },
  { title: 'Suggest automations', note: 'Rules and triggers based on what actually happens', icon: 'automation' },
]

const SUGGESTIONS: Array<{ text: string; record: string; action: string; weight: 'High' | 'Medium' | 'Low' }> = [
  { text: '4 returns are overdue and none has been chased today', record: 'Operations Queues', action: 'Open Returns', weight: 'High' },
  { text: 'Invoice INV-2026-0492 is past due with no reminder sent', record: 'INV-2026-0492', action: 'Open Invoice', weight: 'High' },
  { text: 'NISI Athena Set is double-booked on 14 Shrawan', record: 'BK-2026-0713', action: 'Open Calendar', weight: 'High' },
  { text: 'Aputure 600D has been in maintenance 9 days — above its average', record: 'AP6-0204', action: 'Open Item', weight: 'Medium' },
  { text: 'Two clients are at 100% of their monthly booking limit', record: 'Memberships', action: 'Open Memberships', weight: 'Medium' },
  { text: 'Sub-rental from Lumen House returns tomorrow', record: 'Calendar', action: 'Open Calendar', weight: 'Low' },
]

const WEIGHT_TONE = { High: 'danger', Medium: 'progress', Low: 'neutral' } as const

const PROMPTS = [
  'Which bookings are at risk this week?',
  'Why is revenue down against last month?',
  'What is sitting in the cleaning queue?',
  'Draft a payment reminder for ABC Films',
]

export default function AiAssistant() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="sparkles"
        title="AI Assistant"
        description="Ask about your data, and see what needs attention — with a route to the record behind it."
        actions={<Button icon="refresh">New conversation</Button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 288px', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <Card title="Needs attention">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SUGGESTIONS.map((s) => (
                <div
                  key={s.text}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '10px 11px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    flexWrap: 'wrap',
                  }}
                >
                  <Icon name="sparkles" size={14} style={{ color: BRAND.primary, flexShrink: 0, marginTop: 2 }} />
                  <span style={{ flex: 1, minWidth: 180 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{s.text}</span>
                    {/* Always names the record it came from. */}
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                      {s.record}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 18,
                      padding: '0 6px',
                      borderRadius: 4,
                      flexShrink: 0,
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: BRAND_TEXT[WEIGHT_TONE[s.weight]],
                      fontSize: 'var(--t-meta)',
                      fontWeight: 700,
                    }}
                  >
                    {s.weight}
                  </span>
                  <Button icon="arrow_right">{s.action}</Button>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Ask">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 11 }}>
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  style={{
                    height: 30,
                    padding: '0 11px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    color: 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 40,
                padding: '0 11px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
              }}
            >
              <Icon name="sparkles" size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <input
                aria-label="Ask the assistant"
                placeholder="Ask about bookings, stock, clients or money…"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--t-ui)', color: 'var(--text)', fontFamily: 'inherit' }}
              />
              <Button icon="arrow_right" variant="primary">
                Ask
              </Button>
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Not wired to a model yet. The suggestions above are computed from seed data.
            </p>
          </Card>
        </div>

        <Rail>
          <Card title="What it can do">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {CAPABILITIES.map((c) => (
                <div key={c.title} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span
                    style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--border)', color: BRAND.primary, flexShrink: 0 }}
                  >
                    <Icon name={c.icon} size={13} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{c.title}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.4 }}>{c.note}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ ...cardStyle, padding: 12, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            The assistant proposes; it never writes. Bookings, pricing and stock change only when an operator opens
            the record and decides.
          </div>
        </Rail>
      </div>

      <FooterNote />
    </div>
  )
}
