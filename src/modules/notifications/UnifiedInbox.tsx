import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { formatMoney } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import {
  CHANNELS,
  SEED_CONVERSATIONS,
  QUICK_TEMPLATES,
  computeInboxMetrics,
  type Channel,
  type ConversationThread,
  type ConversationState,
  type QuickTemplate,
  type MessageItem,
} from '../../data/inbox'

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
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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

  // Send message
  const handleSendMessage = () => {
    if (!composerText.trim() || !activeThread) return

    const newMsg: MessageItem = {
      id: `MSG-${Date.now()}`,
      conversationId: activeThread.id,
      direction: 'outbound',
      channel: activeThread.channel,
      author: {
        name: user?.name ?? 'Staff Officer',
        role: user?.role ?? 'Admin',
        isStaff: true,
      },
      content: composerText.trim(),
      sentAtAd: new Date().toISOString(),
      sentAtBs: '22 Shrawan 2083 BS, Just now',
      status: 'Delivered',
      isInternalNote,
      ...(activeThread.linkedBookingId ? { linkedBookingId: activeThread.linkedBookingId } : {}),
    }

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeThread.id) {
          return {
            ...c,
            unread: false,
            lastMessage: isInternalNote ? `[Internal Note] ${composerText}` : composerText,
            messages: [...c.messages, newMsg],
          }
        }
        return c
      })
    )

    setComposerText('')
    setIsInternalNote(false)
    showToast(isInternalNote ? 'Internal note recorded' : `Message delivered via ${activeThread.channel}`)
  }

  // Insert template
  const handleApplyTemplate = (tpl: QuickTemplate) => {
    if (!activeThread) return
    const text = tpl.body
      .replace('{{client_name}}', activeThread.clientName)
      .replace('{{booking_no}}', activeThread.linkedBookingId ?? 'BK-2026-0715')
      .replace('{{staff_name}}', user?.name ?? 'Bikash Thapa')
      .replace('{{outstanding_amount}}', '45,000')
      .replace('{{item_name}}', 'Sony FX6 Cinema Camera')

    setComposerText(text)
    setShowTemplateModal(false)
    showToast(`Template applied: ${tpl.title}`)
  }

  // AI draft assist
  const handleApplyAiSuggestion = () => {
    if (!activeThread) return
    const suggestion = `Namaste ${activeThread.clientName}, yes we have 2x Sony FX6 V-Mount batteries available. I have reserved them for your dispatch under booking ${activeThread.linkedBookingId ?? 'BK-2026-0715'}.`
    setComposerText(suggestion)
    showToast('AI Draft inserted into composer')
  }

  // Role permissions (Law 6)
  const isWarehouse = user?.role === 'Warehouse'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            borderRadius: 6,
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
          <div style={{ display: 'flex', gap: 8 }}>
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
          gap: 12,
        }}
      >
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Open Conversations</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{metrics.openCount}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Active threads across channels</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Unread Inbound</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: metrics.unreadCount > 0 ? 'var(--warning-text, #f59e0b)' : 'var(--text)', marginTop: 4 }}>
            {metrics.unreadCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Requires coordinator review</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Awaiting Reply</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginTop: 4 }}>{metrics.awaitingCount}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Client waiting for response</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Median First Response</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--in, #10b981)', marginTop: 4 }}>{metrics.medianFirstResponse}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Nepal business hours only</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>SLA Breaches</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: metrics.slaBreachCount > 0 ? 'var(--danger)' : 'var(--text)', marginTop: 4 }}>
            {metrics.slaBreachCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Over target response time</div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>Messages Today</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{metrics.messagesToday}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Inbound + outbound today</div>
        </div>
      </div>

      {/* Main 4-Column Responsive Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '200px 320px 1fr 300px',
          gap: 16,
          minHeight: 640,
        }}
      >
        {/* Col 1: Filters & Channels */}
        <Card style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
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

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
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

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
              Compliance & SLA
            </div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.4 }}>
              Business hours: Sun–Fri, 9:00 AM – 6:00 PM NPT. SLA clocks pause on Saturday & national holidays.
            </div>
          </div>
        </Card>

        {/* Col 2: Conversation List */}
        <Card style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--t-ui)' }}>
                No conversations in this filter.
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.id === activeThread?.id
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedId(c.id)
                      setConversations((prev) =>
                        prev.map((item) => (item.id === c.id ? { ...item, unread: false } : item))
                      )
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      background: isSelected ? 'var(--hover)' : 'transparent',
                      border: isSelected ? '1px solid var(--border)' : '1px solid transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
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
                      <div style={{ display: 'flex', gap: 4 }}>
                        {c.linkedBookingId && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              background: 'var(--hover)',
                              padding: '1px 5px',
                              borderRadius: 3,
                              color: 'var(--text2)',
                            }}
                          >
                            {c.linkedBookingId}
                          </span>
                        )}
                        {c.slaBreached && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              background: 'var(--danger-bg, #ffebee)',
                              color: 'var(--danger)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                        gap: 4,
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
                      to="/clients"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
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
                    background: 'var(--warning-bg, #fff8e1)',
                    color: 'var(--warning-text, #b78103)',
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
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
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
                        gap: 4,
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
                              background: 'var(--warning-bg, #fff3e0)',
                              color: '#e65100',
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
                          borderRadius: 8,
                          background: m.isInternalNote
                            ? 'var(--warning-bg, #fffde7)'
                            : isMe
                            ? 'var(--primary)'
                            : 'var(--card)',
                          color: isMe && !m.isInternalNote ? '#ffffff' : 'var(--text)',
                          border: m.isInternalNote
                            ? '1px solid #ffd54f'
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
                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                                <Icon name="checklist" size={13} />
                                <span style={{ flex: 1, textDecoration: 'underline' }}>{att.name}</span>
                                <span style={{ opacity: 0.8 }}>({att.size})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--muted)',
                          alignSelf: isMe ? 'flex-end' : 'flex-start',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
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
                  <span>AI Suggestion: Quick response for equipment availability & dispatch.</span>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleApplyAiSuggestion}
                >
                  Use AI Draft
                </Button>
              </div>

              {/* Composer */}
              <div
                style={{
                  padding: 12,
                  borderTop: '1px solid var(--border)',
                  background: 'var(--card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                        gap: 4,
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

                <div style={{ display: 'flex', gap: 8 }}>
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
                      padding: 8,
                      borderRadius: 4,
                      border: isInternalNote ? '1px solid #ffd54f' : '1px solid var(--border)',
                      background: isInternalNote ? 'var(--warning-bg, #fffde7)' : 'var(--input-bg, transparent)',
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
        <Card style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {activeThread && (
            <>
              {/* Identity */}
              <div>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
                  Client Identity
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--t-title)', color: 'var(--text)' }}>
                    {activeThread.clientName}
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    {activeThread.clientType ?? 'Unidentified Type'}
                  </div>
                  {activeThread.membership && (
                    <div style={{ marginTop: 4 }}>
                      <span
                        style={{
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: 'var(--hover)',
                          color: 'var(--text)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        Tier: {activeThread.membership}
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 4 }}>
                    Phone: {activeThread.clientPhone}
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                    Email: {activeThread.clientEmail}
                  </div>
                </div>
              </div>

              {/* Consent Model (§3) */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
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
                                ? 'var(--in, #10b981)'
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

              {/* Financial Summary (Strict Law 6 compliance: masked for Warehouse) */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
                  Financial Summary
                </div>
                {isWarehouse ? (
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', fontStyle: 'italic' }}>
                    Monetary amounts masked for Warehouse role per Law 6.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text2)' }}>Total Bookings:</span>
                      <strong style={{ color: 'var(--text)' }}>{activeThread.financials.totalBookings}</strong>
                    </div>
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
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                      Deposits are held liabilities, separate from rental balance.
                    </div>
                  </div>
                )}
              </div>

              {/* Direct Actions */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>
                  Quick Launchers
                </div>
                <Link to="/rentals/new" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" icon="plus">
                    Create Booking
                  </Button>
                </Link>
                <Link to="/finance" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" icon="credit_card">
                    Receive Payment
                  </Button>
                </Link>
                <Link to="/operations/cases" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" icon="alert_triangle">
                    Open Operational Case
                  </Button>
                </Link>
              </div>
            </>
          )}
        </Card>
      </div>

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
              borderRadius: 8,
              width: 540,
              maxWidth: '90vw',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {QUICK_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => handleApplyTemplate(tpl)}
                  style={{
                    padding: 12,
                    borderRadius: 6,
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
                  <div style={{ fontSize: 10, color: tpl.requiresHumanDraft ? 'var(--warning-text, #b78103)' : 'var(--in, #10b981)' }}>
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
