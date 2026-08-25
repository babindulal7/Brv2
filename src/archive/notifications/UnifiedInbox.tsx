import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Rail, SideRail } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { formatMoney, grouped, toRupees } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import { canRecordPayment } from '../../lib/rbac'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { RecordPaymentModal } from '../finance/modals/RecordPaymentModal'
import {
  CHANNELS,
  SEED_CONVERSATIONS,
  QUICK_TEMPLATES,
  computeInboxMetrics,
  type Channel,
  type ConversationThread,
  type ConversationState,
  type QuickTemplate,
} from '../../data/inbox'

/**
 * The one placeholder in `QUICK_TEMPLATES` that interpolates a rupee figure.
 * A template containing it is a money surface, so Law 6 gates it — see
 * `visibleTemplates` below.
 */
const MONEY_PLACEHOLDER = '{{outstanding_amount}}'

export default function UnifiedInbox() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ConversationThread[]>(SEED_CONVERSATIONS)
  const [selectedId, setSelectedId] = useState<string>(SEED_CONVERSATIONS[0]?.id ?? '')
  const [selectedChannel, setSelectedChannel] = useState<Channel | 'All'>('All')
  const [selectedState, setSelectedState] = useState<ConversationState | 'All'>('Open')
  const [searchQuery, setSearchQuery] = useState('')
  const [composerText, setComposerText] = useState('')
  const [isInternalNote, setIsInternalNote] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  /*
   * The composer's refusal line. This screen had no inline error surface at all
   * — only `showToast`, which is a success channel (Law 12: errors are inline
   * and persistent, toasts carry successes only). `ErrorBanner` is the
   * codebase's inline persistent error, the same one `PackingWorkspace` renders
   * for a refused dispatch; it is reused here rather than a new affordance
   * being invented, and no error toast is introduced.
   *
   * Title travels with the message (the `banner` shape `Finance.tsx` uses)
   * because three different refusals land here — a send, a note, a template
   * insertion — and a banner headed "This message was not sent" above a refused
   * template insertion would be its own small lie.
   */
  const [composerError, setComposerError] = useState<{ title: string; message: string } | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Active thread safely computed
  const activeThread: ConversationThread | undefined = useMemo(() => {
    return conversations.find((c) => c.id === selectedId) || conversations[0]
  }, [conversations, selectedId])

  // Filtered conversation list
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (selectedChannel !== 'All' && c.channel !== selectedChannel) return false
      if (selectedState !== 'All' && c.state !== selectedState) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = c.clientName.toLowerCase().includes(q)
        const matchPhone = c.clientPhone.includes(q)
        const matchMsg = c.lastMessage.toLowerCase().includes(q)
        const matchBooking = c.linkedBookingId?.toLowerCase().includes(q)
        if (!matchName && !matchPhone && !matchMsg && !matchBooking) return false
      }
      return true
    })
  }, [conversations, selectedChannel, selectedState, searchQuery])

  // KPI calculations
  const metrics = useMemo(() => computeInboxMetrics(conversations), [conversations])

  // Channel count reconciliation
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = { All: conversations.length }
    CHANNELS.forEach((ch) => {
      counts[ch] = conversations.filter((c) => c.channel === ch).length
    })
    return counts
  }, [conversations])

  /*
   * Send / Record Note.
   *
   * This built a `MessageItem` whose author was
   * `{ name: user?.name ?? 'Staff Officer', role: user?.role ?? 'Admin' }`,
   * appended it to the thread with `status: 'Delivered'`, and toasted
   * "Message delivered via WhatsApp" — synchronously, against no action at all.
   * Three separate fabrications in one handler:
   *
   *  1. `'Staff Officer'` put a named-sounding staff author on a CLIENT-FACING
   *     message. An operator scrolling the thread a week later reads an
   *     attributed reply and believes a colleague sent it.
   *  2. `?? 'Admin'` ESCALATED. A fallback must degrade, never promote: the
   *     absent session was granted a role higher than it had, and stamped onto
   *     outbound communication. (`author.role` is typed `string` in
   *     `data/inbox`, so nothing caught that 'Admin' is not even one of the
   *     business roles `SystemRole` defines.) Same class as the `USR-001` /
   *     `Manager` pair removed across the rest of the codebase.
   *  3. `status: 'Delivered'` plus the toast reported a delivery for a write
   *     that never happened. There is NO send action — `src/actions/` has no
   *     message or notification action of any kind, so there was nothing to
   *     dispatch and nothing left this screen. The thread grew a message that
   *     existed only in React state until the next refresh, and the operator
   *     was told the client had received it.
   *
   * All three are gone. No session, no authored message; and with no wired
   * action there is no honest way to append anything at all, so the composer
   * refuses in both cases and keeps the operator's draft. The reason lands on
   * the inline `composerError` banner below (Law 12), never on a toast.
   */
  const handleSendMessage = () => {
    if (!composerText.trim() || !activeThread) return

    const title = isInternalNote ? 'This note was not recorded' : 'This message was not sent'

    if (!user) {
      setComposerError({
        title,
        message:
          'You are not signed in, so this cannot be recorded under anyone’s name. Nothing was written and nothing was added to the thread — sign in and try again.',
      })
      return
    }

    setComposerError({
      title,
      message: isInternalNote
        ? 'Recording an internal note is not wired to any action in this build, so nothing was written to the thread. Your draft is still in the composer.'
        : `Sending is not wired to any action in this build. Nothing was sent to ${activeThread.clientName} via ${activeThread.channel} and nothing was added to the thread. Your draft is still in the composer.`,
    })
  }

  // Insert template
  const handleApplyTemplate = (tpl: QuickTemplate) => {
    if (!activeThread) return

    /*
     * The second fabricated author on this screen, and the one that reached
     * furthest: `{{staff_name}}` was filled with `user?.name ?? 'Bikash Thapa'`
     * — a real-sounding staff name signing a message addressed to a named
     * client, on behalf of a session that was not signed in. Every template
     * body that signs off does so through this placeholder, so an unidentified
     * session could put that signature into the composer with one click.
     *
     * Refused rather than substituted, the same rule the send path now follows:
     * no session, no authored message. The whole template is withheld — not
     * inserted with the placeholder left raw — because a draft reading
     * "Regards, {{staff_name}}" one Send press from a client is its own defect.
     */
    if (!user) {
      setComposerError({
        title: 'This template was not inserted',
        message:
          'You are not signed in, so a template that signs off in a staff member’s name cannot be filled in. Nothing was inserted into the composer.',
      })
      setShowTemplateModal(false)
      return
    }

    /*
     * RULED 12 Aug 2026: a template that cites a booking is WITHHELD when the
     * conversation has none — not inserted with the sentence dropped, and not
     * with a number invented.
     *
     * This replaced `.replace('{{booking_no}}', activeThread.linkedBookingId ?? 'B-715')`,
     * which minted a real-looking booking number for a thread that has no
     * booking, in a message one Send press from a client. Dropping just the
     * sentence was the other candidate and was rejected: it silently edits
     * wording someone approved as standard, and the operator cannot see what
     * went missing.
     *
     * Withholding matches what the payment launcher below already does for
     * exactly this thread — a conversation with no linked booking cannot take a
     * booking-shaped action, and now cannot send booking-shaped text either.
     */
    if (tpl.body.includes('{{booking_no}}') && !activeThread.linkedBookingId) {
      setComposerError({
        title: 'This template was not inserted',
        message: `“${tpl.title}” quotes a booking number, and this conversation with ${activeThread.clientName} is not linked to a booking. Nothing was inserted — link the conversation to its booking, or write the message by hand.`,
      })
      setShowTemplateModal(false)
      return
    }

    const text = tpl.body
      .replace('{{client_name}}', activeThread.clientName)
      .replace('{{booking_no}}', activeThread.linkedBookingId ?? '')
      .replace('{{staff_name}}', user.name)
      /*
       * Was the literal `'45,000'` — a rupee figure belonging to no client,
       * dropped into a payment-chasing message addressed to a named client and
       * one Send click from reaching them. The thread carries the real balance;
       * it is the same `outstandingRentalPaisa` the Account Summary renders in
       * the right rail, so the message and the panel beside it can no longer
       * quote different numbers.
       *
       * `grouped(toRupees(…))`, not `formatMoney(…)`: the template body already
       * reads "…balance of Rs {{outstanding_amount}}", and `formatMoney`
       * prefixes its own "Rs ". This is display of a figure the screen already
       * holds, so it is not arithmetic on rupees.
       *
       * Both fabrications this comment used to record are now closed:
       * `'Bikash Thapa'` above (no session, no signature) and `'B-715'` in the
       * guard above this block (no booking, no template). The `?? ''` left on
       * the `{{booking_no}}` replace is unreachable for a template that cites
       * one — the guard returns first — and is kept only so a template that does
       * NOT cite a booking cannot be broken by this line.
       */
      .replace(
        '{{outstanding_amount}}',
        grouped(toRupees(activeThread.financials.outstandingRentalPaisa)),
      )
      .replace('{{item_name}}', 'Sony FX6 Cinema Camera')

    setComposerText(text)
    setShowTemplateModal(false)
    showToast(`Template applied: ${tpl.title}`)
  }

/*
 * `handleApplyAiSuggestion` was DELETED here, not disabled in place.
 *
 * It inserted one hardcoded sentence:
 *
 *   "Namaste {client}, yes we have 2x Sony FX6 V-Mount batteries available.
 *    I have reserved them for your dispatch under booking {booking}."
 *
 * Nothing in it was true by construction. No inventory read backed "available",
 * no action wrote the "reserved", and the booking number was minted as 'B-715'
 * for any thread that had none. It was a stock promise to a named client, one
 * Send press away, and it is the single most consequential fabrication this pass
 * found — the others misled an operator; this one misleads the client directly.
 *
 * Deleted rather than left dormant behind the disabled button, because a handler
 * that still composes the sentence is one `onClick` away from shipping again.
 * The button is now `Unavailable` with the reason attached (see the composer).
 *
 * RULED 12 Aug 2026: the control **stays in the UI, disabled, with its reason
 * shown** — it is not withdrawn, and it is not rebuilt as part of this pass.
 * Keeping it visible-but-refusing is what stops the capability being silently
 * forgotten; removing it would tidy the surface at the cost of the reminder.
 *
 * That leaves no open decision here. Building it for real — an inventory read
 * plus a reservation written through an action — is a FEATURE, tracked wherever
 * features are tracked, not a gap in this file.
 */

  /*
   * Law 6 — money VISIBILITY, and the only role question this screen asks.
   *
   * This was `user?.role === 'Warehouse'`, a hand-rolled equality answering one
   * ninth of the question it was named for. `MONEY_BLIND` in `lib/rbac` is
   * Warehouse, Technician, Driver **and** Client, so a technician holding a
   * tablet in front of a client, a driver at the door, and the client's own
   * portal session each read the Financial Summary below in full — lifetime
   * spend, outstanding balance and deposit held — while the screen's own comment
   * claimed Law 6 compliance.
   *
   * `useCanViewMoney()` is the canonical gate the rest of the codebase uses; it
   * resolves through `canViewMoney` in `lib/rbac`, which mirrors
   * `auth_can_view_money()` in migration 0014 so the UI and RLS cannot disagree.
   * The set is never re-derived at a call site — that re-derivation is precisely
   * what went stale here.
   *
   * Named for the question it answers rather than for one role, because the old
   * name is what let "may this session see money?" and "is this the warehouse
   * floor?" be mistaken for each other. Checked: this screen has no Warehouse
   * affordance of the second kind — the money gate was its sole role check.
   */
  const canSeeMoney = useCanViewMoney()

  /*
   * Second money surface on this screen, found while chasing the first and
   * never gated by anything: applying "Outstanding Payment Notice" writes the
   * client's rental balance straight into the composer, in front of whoever is
   * holding the tablet. A template that interpolates a rupee figure is money,
   * so it is absent from the picker for a money-blind session — omitted, not
   * offered-then-blanked, because a template that inserts "balance of Rs " and
   * nothing else is worse than no template.
   *
   * Keyed off the body's own placeholder rather than `tpl.category`, so a money
   * template added to `data/inbox` later inherits the gate without anyone
   * remembering to tag it.
   */
  const visibleTemplates = useMemo(
    () => (canSeeMoney ? QUICK_TEMPLATES : QUICK_TEMPLATES.filter((t) => !t.body.includes(MONEY_PLACEHOLDER))),
    [canSeeMoney],
  )

  /*
   * Checked before moving the Receive Payment launcher below: there was **no**
   * gating on it at all, so there was nothing to preserve. The Financial
   * Summary panel was gated (wrongly — see above), but the money *action* was
   * offered to every role — the whole money-blind floor included, which Law 6
   * forbids outright.
   *
   * `canRecordPayment` is the same rule the dispatcher resolves
   * `recordPayment`'s `permissions: ['payment.create']` through (see
   * `actions/core.ts` → `lib/rbac`), so the button is now absent in exactly the
   * cases the dispatch would refuse — absent, not disabled, per Law 6. It is
   * strictly narrower than money *visibility* (Owner, Coordinator, Accounts
   * only), so every money-blind role loses the button as a consequence and no
   * second check is needed.
   *
   * `isOnline` is deliberately not passed. `RecordPaymentModal` dispatches
   * without it too, so the dispatcher evaluates `canRecordPayment` with the
   * same online default; hiding the button offline while the action would still
   * accept the payment (or the reverse) is the mismatch worth avoiding. Wiring
   * `useNetwork()` through both is a change to the payment path, not this
   * screen.
   */
  const canTakePayment = user ? canRecordPayment(user.role) : false

  /*
   * The booking a payment from this screen would post against. `undefined` for
   * a thread with no linked booking — the seed data's unknown-number walk-in is
   * exactly that — and the old handler dispatched `bookingId: undefined`
   * anyway, so a payment (had one been written) would have landed against
   * nothing.
   */
  const paymentBookingId = activeThread?.linkedBookingId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      {/* Toast */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: 'var(--card)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            padding: '12px 18px',
            borderRadius: 'var(--r-xs)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 'var(--t-ui)',
            fontWeight: 600,
          }}
        >
          <Icon name="check" size={16} />
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Unified Communication Inbox"
        description="Single multi-channel workspace for client communications with rental context, consent gates & SLA tracking."
        actions={
          <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
            <Button
              variant="secondary"
              onClick={() => setShowTemplateModal(true)}
              icon="checklist"
            >
              Templates
            </Button>
            <Button
              variant="primary"
              onClick={() => showToast('New conversation draft initiated')}
              icon="plus"
            >
              New Conversation
            </Button>
          </div>
        }
      />

      {/* Six KPI Cards (§6) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 'var(--sp-md)',
        }}
      >
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-md)' }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Open Conversations</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 'var(--sp-xs)' }}>{metrics.openCount}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Active threads across channels</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-md)' }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Unread Inbound</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: metrics.unreadCount > 0 ? 'var(--ready-text)' : 'var(--text)', marginTop: 'var(--sp-xs)' }}>
            {metrics.unreadCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Requires coordinator review</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-md)' }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Awaiting Reply</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginTop: 'var(--sp-xs)' }}>{metrics.awaitingCount}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Client waiting for response</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-md)' }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Median First Response</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)', marginTop: 'var(--sp-xs)' }}>{metrics.medianFirstResponse}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Nepal business hours only</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-md)' }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>SLA Breaches</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: metrics.slaBreachCount > 0 ? 'var(--danger)' : 'var(--text)', marginTop: 'var(--sp-xs)' }}>
            {metrics.slaBreachCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Over target response time</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-md)' }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Messages Today</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 'var(--sp-xs)' }}>{metrics.messagesToday}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Inbound + outbound today</div>
        </div>
      </div>

      {/* Main 4-Column Responsive Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 320px 1fr auto',
          gap: 'var(--sp-lg)',
          minHeight: 640,
        }}
      >
        {/* Col 1: Filters & Channels */}
        <SideRail width={200} label="Mailboxes">
        <Card style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          <div>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 'var(--sp-sm)', letterSpacing: 0.5 }}>
              Channels ({channelCounts.All})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button
                type="button"
                onClick={() => setSelectedChannel('All')}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 10px',
                  borderRadius: 4,
                  border: 'none',
                  background: selectedChannel === 'All' ? 'var(--hover)' : 'transparent',
                  color: selectedChannel === 'All' ? 'var(--text)' : 'var(--text2)',
                  fontWeight: selectedChannel === 'All' ? 600 : 500,
                  fontSize: 'var(--t-ui)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>All Channels</span>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{channelCounts.All}</span>
              </button>
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setSelectedChannel(ch)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '7px 10px',
                    borderRadius: 4,
                    border: 'none',
                    background: selectedChannel === ch ? 'var(--hover)' : 'transparent',
                    color: selectedChannel === ch ? 'var(--text)' : 'var(--text2)',
                    fontWeight: selectedChannel === ch ? 600 : 500,
                    fontSize: 'var(--t-ui)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name={ch === 'WhatsApp' ? 'phone' : ch === 'Email' ? 'mail' : ch === 'SMS' ? 'phone' : 'bell'} size={14} />
                    {ch}
                  </span>
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{channelCounts[ch] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)' }}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 'var(--sp-sm)', letterSpacing: 0.5 }}>
              Status
            </div>
            {(['Open', 'Snoozed', 'Closed', 'Archived', 'Spam'] as ConversationState[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedState(st)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: 'none',
                  background: selectedState === st ? 'var(--hover)' : 'transparent',
                  color: selectedState === st ? 'var(--text)' : 'var(--text2)',
                  fontWeight: selectedState === st ? 600 : 500,
                  fontSize: 'var(--t-ui)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>{st}</span>
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)' }}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 'var(--sp-sm)', letterSpacing: 0.5 }}>
              Compliance & SLA
            </div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.4 }}>
              Business hours: Sun–Fri, 9:00 AM – 6:00 PM NPT. SLA clocks pause on Saturday & national holidays.
            </div>
          </div>
        </Card>
        </SideRail>

        {/* Col 2: Conversation List */}
        <Card style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search conversations, clients…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 28px',
                background: 'var(--hover)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text)',
                fontSize: 'var(--t-ui)',
              }}
            />
            <span style={{ position: 'absolute', left: 8, top: 8, color: 'var(--muted)' }}>
              <Icon name="search" size={14} />
            </span>
          </div>

          {/* List items */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredConversations.length === 0 ? (
              <div style={{ padding: '24px 12px' }}>
                <EmptyState
                  title="No conversations in this filter"
                  description="Try switching channels, status, or clearing your search."
                  actionLabel="Clear filters"
                  onAction={() => {
                    setSelectedChannel('All')
                    setSelectedState('All')
                    setSearchQuery('')
                  }}
                />
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.id === activeThread?.id
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedId(c.id)
                      // The refusal names a client and a channel, so it belongs
                      // to the thread it was raised on — persistent there, not
                      // carried onto the next conversation.
                      setComposerError(null)
                      setConversations((prev) =>
                        prev.map((item) => (item.id === c.id ? { ...item, unread: false } : item))
                      )
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 'var(--r-xs)',
                      background: isSelected ? 'var(--hover)' : 'transparent',
                      border: isSelected ? '1px solid var(--border)' : '1px solid transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--sp-xs)',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {c.unread && (
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: 'var(--primary)',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontWeight: c.unread ? 700 : 600,
                            fontSize: 'var(--t-ui)',
                            color: 'var(--text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 160,
                          }}
                        >
                          {c.clientName}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {c.channel}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 'var(--t-meta)',
                        color: c.unread ? 'var(--text)' : 'var(--text2)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.lastMessage}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                      <div style={{ display: 'flex', gap: 'var(--sp-xs)' }}>
                        {c.linkedBookingId && (
                          <Link
                            to={`/rentals/${c.linkedBookingId}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 'var(--t-th)',
                              fontWeight: 600,
                              background: 'var(--hover)',
                              padding: '1px 5px',
                              borderRadius: 3,
                              color: 'var(--text2)',
                              textDecoration: 'none',
                            }}
                          >
                            {c.linkedBookingId}
                          </Link>
                        )}
                        {c.slaBreached && (
                          <span
                            style={{
                              fontSize: 'var(--t-th)',
                              fontWeight: 700,
                              background: 'var(--st-danger-bg)',
                              color: 'var(--st-danger-fg)',
                              padding: '1px 5px',
                              borderRadius: 3,
                            }}
                          >
                            SLA Breached
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {c.lastMessageAtBs.split(',')[0]}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>

        {/* Col 3: Conversation Thread & Composer */}
        <Card style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          {activeThread ? (
            <>
              {/* Thread Header */}
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--card)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                    <h3 style={{ margin: 0, fontSize: 'var(--t-title)', color: 'var(--text)' }}>
                      {activeThread.clientName}
                    </h3>
                    <span
                      style={{
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--hover)',
                        color: 'var(--text2)',
                      }}
                    >
                      {activeThread.channel}
                    </span>
                    {activeThread.priority === 'Overdue or damage case' && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>
                        ● High Priority Case
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                    Assigned to: <strong style={{ color: 'var(--text2)' }}>{activeThread.assignedTo}</strong> · SLA Target: 30 mins
                  </div>
                </div>

                {/* Quick Launchers (Launchers, not actions per §8) */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {activeThread.linkedBookingId && (
                    <Link
                      to={`/rentals/${activeThread.linkedBookingId}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-xs)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        padding: '5px 8px',
                        borderRadius: 4,
                        background: 'var(--hover)',
                        color: 'var(--text)',
                        textDecoration: 'none',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <Icon name="checklist" size={13} />
                      {activeThread.linkedBookingId}
                    </Link>
                  )}
                  {activeThread.clientId && (
                    <Link
                      to={`/clients/${activeThread.clientId}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-xs)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        padding: '5px 8px',
                        borderRadius: 4,
                        background: 'var(--hover)',
                        color: 'var(--text)',
                        textDecoration: 'none',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <Icon name="users" size={13} />
                      Profile
                    </Link>
                  )}
                </div>
              </div>

              {/* Unidentified Alert Banner if unlinked */}
              {!activeThread.clientId && (
                <div
                  style={{
                    background: 'var(--st-progress-bg)',
                    color: 'var(--st-progress-fg)',
                    padding: '8px 16px',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span>Unidentified Client: Phone number not linked to existing client record.</span>
                  <Button
                    variant="secondary"
                    onClick={() => showToast('Opened Link to Client modal')}
                  >
                    Link to Client
                  </Button>
                </div>
              )}

              {/* Messages Feed */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 'var(--sp-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-md)',
                  background: 'var(--app)',
                }}
              >
                {activeThread.messages.map((m) => {
                  const isMe = m.direction === 'outbound'
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--sp-xs)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--muted)',
                          alignSelf: isMe ? 'flex-end' : 'flex-start',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>{m.author.name}</span>
                        <span>·</span>
                        <span>{m.sentAtBs}</span>
                        {m.isInternalNote && (
                          <span
                            style={{
                              background: 'var(--st-progress-bg)',
                              color: 'var(--st-progress-fg)',
                              padding: '1px 4px',
                              borderRadius: 3,
                              fontWeight: 700,
                            }}
                          >
                            Internal Note
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--r-sm)',
                          background: m.isInternalNote
                            ? 'var(--st-progress-bg)'
                            : isMe
                            ? 'var(--primary)'
                            : 'var(--card)',
                          color: isMe && !m.isInternalNote ? 'var(--on-brand)' : 'var(--text)',
                          border: m.isInternalNote
                            ? '1px solid var(--st-progress-fg)'
                            : isMe
                            ? '1px solid var(--primary)'
                            : '1px solid var(--border)',
                          fontSize: 'var(--t-ui)',
                          lineHeight: 1.45,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        {m.content}

                        {/* Attachments */}
                        {m.attachments && m.attachments.length > 0 && (
                          <div style={{ marginTop: 'var(--sp-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                            {m.attachments.map((att) => (
                              <div
                                key={att.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(0,0,0,0.06)',
                                  fontSize: 'var(--t-meta)',
                                  fontWeight: 500,
                                }}
                              >
                                <Icon name="checklist" size={13} style={{ flexShrink: 0 }} />
                                <span
                                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}
                                  title={att.name}
                                >
                                  {att.name}
                                </span>
                                <span style={{ opacity: 0.8, flexShrink: 0 }}>({att.size})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: 'var(--t-th)',
                          color: 'var(--muted)',
                          alignSelf: isMe ? 'flex-end' : 'flex-start',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--sp-xs)',
                        }}
                      >
                        {isMe && <span>Status: {m.status}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* AI Suggestion Box */}
              <div
                style={{
                  padding: '8px 16px',
                  background: 'var(--hover)',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 'var(--t-meta)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}>
                  <Icon name="bell" size={14} />
                  <span>AI drafting is not built — no availability or reservation is checked.</span>
                </div>
                {/*
                  * Was a live "Use AI Draft" button calling `handleApplyAiSuggestion`,
                  * which inserted a HARDCODED sentence telling the client that 2x Sony
                  * FX6 V-Mount batteries were available and had been reserved for their
                  * dispatch. Nothing read inventory and nothing wrote a reservation — it
                  * was a stock promise to a named client, one Send press away.
                  *
                  * This needed no product ruling to remove. Whether the product should
                  * have AI drafting is a decision; whether a button may assert stock
                  * nobody checked is not, and it is the same defect this pass has been
                  * removing everywhere else. Refused the way `ImportCenter` and
                  * `GenerateReferralCode` refuse: disabled, with the reason attached.
                  *
                  * RULED 12 Aug 2026: it stays here, disabled, rather than being removed
                  * from the UI. A control that refuses out loud keeps the capability on
                  * the roadmap; deleting the panel would tidy the surface and lose the
                  * only reminder that it was ever intended. Nothing here is undecided —
                  * building it for real is a feature, not an open question.
                  */}
                <Unavailable reason="AI drafting is not connected. The draft it used to insert claimed specific equipment was available and reserved, without reading inventory or writing a reservation — so it could promise a client stock that was never held.">
                  <Button variant="secondary" disabled>
                    Use AI Draft
                  </Button>
                </Unavailable>
              </div>

              {/* Composer */}
              <div
                style={{
                  padding: 'var(--sp-md)',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                      />
                      Internal Note (Team only)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowTemplateModal(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-xs)',
                      }}
                    >
                      <Icon name="checklist" size={13} />
                      Insert Template
                    </button>
                  </div>

                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Channel: <strong>{activeThread.channel}</strong> · Draft-first enforcement
                  </span>
                </div>

                {/*
                  Inline and persistent — it stays until the operator changes
                  something, because the thing it reports (nothing was sent) does
                  not stop being true after 3.5 seconds the way the old toast did.
                  No `onRetry`: pressing Send again would refuse identically.
                */}
                {composerError && (
                  <ErrorBanner title={composerError.title} message={composerError.message} />
                )}

                <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                  <textarea
                    rows={2}
                    placeholder={
                      isInternalNote
                        ? 'Write an internal note for staff…'
                        : `Reply to ${activeThread.clientName} via ${activeThread.channel}…`
                    }
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    style={{
                      flex: 1,
                      padding: 'var(--sp-sm)',
                      borderRadius: 4,
                      border: isInternalNote ? '1px solid var(--st-progress-fg)' : '1px solid var(--border)',
                      background: isInternalNote ? 'var(--st-progress-bg)' : 'var(--input-bg, transparent)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-ui)',
                      fontFamily: 'inherit',
                      resize: 'none',
                    }}
                  />
                  <Button
                    variant={isInternalNote ? 'secondary' : 'primary'}
                    onClick={handleSendMessage}
                    disabled={!composerText.trim()}
                    icon={isInternalNote ? 'checklist' : 'truck'}
                  >
                    {isInternalNote ? 'Record Note' : 'Send'}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              No active conversation selected.
            </div>
          )}
        </Card>

        {/* Col 4: Client Context Panel (Right Rail) */}
        <Rail width={300} label="Details">
        <Card style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)', overflowY: 'auto' }}>
          {activeThread && (
            <>
              {/* Identity */}
              <div>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 'var(--sp-sm)', letterSpacing: 0.5 }}>
                  Client Identity
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--t-title)', color: 'var(--text)' }}>
                    {activeThread.clientName}
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    {activeThread.clientType ?? 'Unidentified Type'}
                  </div>
                  {activeThread.membership && (
                    <div style={{ marginTop: 'var(--sp-xs)' }}>
                      <span
                        style={{
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 'var(--r-btn)',
                          background: 'var(--hover)',
                          color: 'var(--text)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        Tier: {activeThread.membership}
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
                    Phone: {activeThread.clientPhone}
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                    Email: {activeThread.clientEmail}
                  </div>
                </div>
              </div>

              {/* Consent Model (§3) */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)' }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 'var(--sp-sm)', letterSpacing: 0.5 }}>
                  Consent Status
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
                  {CHANNELS.map((ch) => {
                    const c = activeThread.consent[ch]
                    return (
                      <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text2)' }}>{ch} Marketing:</span>
                        <span
                          style={{
                            fontWeight: 600,
                            color:
                              c.marketing === 'Opted in'
                                ? 'var(--success)'
                                : c.marketing === 'Opted out'
                                ? 'var(--danger)'
                                : 'var(--muted)',
                          }}
                        >
                          {c.marketing}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/*
                Account Summary — Law 6.

                Was headed "Financial Summary" and rendered an italic
                "Monetary amounts masked for Warehouse role per Law 6" for the
                one role the old gate knew. Two things were wrong with that line
                beyond the gate itself: Law 6 asks a call site to OMIT the
                figure, not to mask it (`lib/moneyVisibility` says so in as many
                words, and `Payments.tsx` / `BookingDetail.tsx` both drop the
                affordance outright), and a Technician or Driver reading a notice
                about "the Warehouse role" would reasonably conclude the screen
                had mistaken who they were.

                The three rupee rows and the deposit-liability note are now
                absent for a money-blind session. The booking COUNT stays — it is
                a relationship fact that carries no figure, and it happens to
                live on `financials` only because the seed shape puts it there;
                same call as BookingDetail's item roll-up, where the tally stays
                and the subtotal goes. The heading is neutral so it does not
                promise finances to a session that will see none.
              */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)' }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 'var(--sp-sm)', letterSpacing: 0.5 }}>
                  Account Summary
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text2)' }}>Total Bookings:</span>
                    <strong style={{ color: 'var(--text)' }}>{activeThread.financials.totalBookings}</strong>
                  </div>
                  {canSeeMoney && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text2)' }}>Lifetime Spend:</span>
                        <strong style={{ color: 'var(--text)' }}>{formatMoney(activeThread.financials.lifetimeSpendPaisa)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text2)' }}>Rental Outstanding:</span>
                        <strong style={{ color: activeThread.financials.outstandingRentalPaisa > 0 ? 'var(--danger)' : 'var(--text)' }}>
                          {formatMoney(activeThread.financials.outstandingRentalPaisa)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text2)' }}>Deposit Held:</span>
                        <strong style={{ color: 'var(--primary)' }}>
                          {formatMoney(activeThread.financials.depositHeldPaisa)}
                        </strong>
                      </div>
                      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 'var(--sp-xs)' }}>
                        Deposits are held liabilities, separate from rental balance.
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Direct Actions */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 'var(--sp-xs)', letterSpacing: 0.5 }}>
                  Quick Launchers
                </div>
                <Link to="/rentals/new" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" icon="plus">
                    Create Booking
                  </Button>
                </Link>
                {/*
                  This dispatched
                  `recordPayment({ bookingId: activeThread.linkedBookingId, amountPaisa: 100000 })`
                  — Rs 1,000 that no operator typed, on a screen with no amount input
                  anywhere — with no `ActionContext`, no `.catch()`, and
                  `showToast('Payment recorded via Global Action')` on the very next line,
                  synchronously. The confirmation therefore appeared whether or not anything
                  happened: an operator on the phone with a client paying Rs 45,000 clicked
                  here, was told the payment was recorded, and stopped chasing a balance that
                  was never touched.

                  Same fix the audit applied to BookingDetail's hardcoded
                  `amountPaisa: 500000`: the button opens the shared `RecordPaymentModal`
                  instead, which is the only place an amount, method and reference are
                  collected and which takes identity from `useAuth()`. The invented Rs 1,000
                  gets no replacement default — this screen knows no figure to offer, so the
                  modal opens with an empty amount for the operator to type.
                */}
                {canTakePayment &&
                  (paymentBookingId ? (
                    <Button
                      variant="secondary"
                      icon="credit_card"
                      onClick={() => setShowPaymentModal(true)}
                    >
                      Receive Payment
                    </Button>
                  ) : (
                    /*
                      No linked booking, no payment. Withheld with the reason stated rather
                      than offered and refused on submit — there is nothing for the operator
                      to correct inside the modal, since the missing thing is the thread's
                      booking link, not anything they would type.
                    */
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.4 }}>
                      Receive Payment needs a linked booking — this conversation has none.
                    </div>
                  ))}
                <Link to="/operations/cases" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" icon="alert_triangle">
                    Open Operational Case
                  </Button>
                </Link>
              </div>
            </>
          )}
        </Card>
        </Rail>
      </div>

      {/*
        The shared payment modal — the only place on this screen where an amount
        is entered. Mounted only while open, the pattern Finance.tsx and
        BookingDetail.tsx both document: the modal captures `initialInvoiceId`
        into `useState` on first mount, so a permanently mounted instance keeps
        posting against the first thread it ever saw (P0-1,
        BUG_SWEEP_REGISTER_v1.0). That bites harder here than anywhere else —
        the "current booking" on this screen changes with a click in the
        conversation list, not with a route change. `key` is belt-and-braces on
        top: the overlay locks the page behind it, but if the active thread ever
        does change under an open modal, React remounts it and it recaptures the
        booking rather than posting against the previous one.

        RULED 12 Aug 2026 — a payment posts against the BOOKING. When an invoice
        is raised later it settles against that; the payment does not wait for a
        document to exist.

        So this screen handing a booking to the modal is correct, not a
        workaround, and the same is true at BookingDetail's mount.

        The schema was already shaped for it, which is the strongest evidence the
        ruling matches the design: `payments.booking_id` is **NOT NULL** — every
        payment names a booking — while `payments.invoice_id` is **NULLABLE**. A
        payment with no invoice is a first-class row, not a gap. That is also why
        the seeded advances (`'Advance Payment'::payment_type`) carry a booking
        and settle later.

        The success toast lives in `onSuccess`, which the modal calls only after
        `recordPayment` resolves. ⚠ That sentence used to end "That action is
        still a stub, so today the dispatcher rejects it" — no longer true:
        `actions/finance/recordPayment.ts:252` is `implemented: true` on
        `payment.create`, a capability `core.ts:checkCapability` does resolve, so
        the dispatch reaches the database and the toast now follows a real write.
        A rejection still shows on the modal's own inline error line (Law 12 —
        there is no error toast, and none is invented). Either way this screen
        never announces a payment that was not written.
      */}
      {showPaymentModal && activeThread && paymentBookingId && (
        <RecordPaymentModal
          key={paymentBookingId}
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          initialInvoiceId={paymentBookingId}
          invoices={[
            {
              id: paymentBookingId,
              client: activeThread.clientName,
              /*
                A real figure off the thread — the same Rental Outstanding the
                panel above renders — and labelled as such, because it is the
                client's outstanding balance and not an invoice total this
                screen has. It is display-only: the modal shows it in the picker
                label and never submits it, and the operator still types the
                amount being paid.
              */
              amount: `Outstanding ${formatMoney(activeThread.financials.outstandingRentalPaisa)}`,
              /*
                The modal never renders `status`, and the inbox knows no invoice
                status to put here. The conversation's own state ('Open',
                'Snoozed') is not one, so it is not passed off as one.
              */
              status: '',
              booking: paymentBookingId,
            },
          ]}
          onSuccess={(p) =>
            showToast(`Payment recorded — ${formatMoney(p.amountPaisa)} against ${paymentBookingId}`)
          }
        />
      )}

      {/* Template Selection Modal */}
      {showTemplateModal && activeThread && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowTemplateModal(false)}
        >
          <div
            style={{
              background: 'var(--card)',
              borderRadius: 'var(--r-sm)',
              width: 540,
              maxWidth: '90vw',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-lg)',
              boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--t-title)', color: 'var(--text)' }}>
                Approved Message Templates
              </h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Templates enforce consistent communication and policy compliance. Variables are populated from the active booking and client profile.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', maxHeight: 360, overflowY: 'auto' }}>
              {visibleTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => handleApplyTemplate(tpl)}
                  style={{
                    padding: 'var(--sp-md)',
                    borderRadius: 'var(--r-xs)',
                    border: '1px solid var(--border)',
                    background: 'var(--hover)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--text)' }}>{tpl.title}</strong>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                      Category: {tpl.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.35 }}>
                    {tpl.body}
                  </div>
                  <div style={{ fontSize: 'var(--t-th)', color: tpl.requiresHumanDraft ? 'var(--ready-text)' : 'var(--success)' }}>
                    {tpl.requiresHumanDraft ? '🔒 Mandatory Human Draft Review' : '⚡ Auto-send permitted'}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setShowTemplateModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
