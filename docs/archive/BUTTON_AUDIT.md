> 🗄 **ARCHIVED 16 Aug 2026 — unfinished and pre-cut.** Every row reads `TBD`, and it
> inventories a screen set three rounds of administrative cuts have since changed
> (routes 73 → 66 → 54). It was never a build target and is not one now. Moved out of the
> repo root so it stops appearing beside the live governance documents.
> Current route table: `src/App.tsx`. Current plan: `PLAN.md`.

# BUTTON AUDIT (Phase 1)

This document maps all identified UI buttons to the proposed Global Action Registry.

## 01 Today Operations

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\today\CalendarPanel.tsx` | `Button: navigate(dayHref(CAL_PREV_ISO))} style={ghostBtn} >` | TBD | |
| `modules\today\CalendarPanel.tsx` | `Button: setPeriod(CUSTOM_CHIP)} aria-pressed={period === CUSTOM_CHIP} style={chip(CUSTOM_CHIP)} >...` | TBD | |
| `modules\today\CalendarPanel.tsx` | `Button: setPeriod(p)} aria-pressed={period === p} style={chip(p)}> {p}` | TBD | |
| `modules\today\CalendarPanel.tsx` | `Button: navigate('/calendar?d=2026-06-01')} style={ghostBtn} >` | TBD | |
| `modules\today\CalendarPanel.tsx` | `Button: navigate('/calendar?d=2026-08-01')} style={ghostBtn} >` | TBD | |
| `modules\today\CalendarPanel.tsx` | `Button: navigate(dayHref(d.iso))} aria-current={isToday ? 'date' : undefined} aria-label={ (d.bs ...` | TBD | |
| `modules\today\CalendarPanel.tsx` | `Button: navigate(dayHref(CAL_NEXT_ISO))} style={{ ...ghostBtn, marginLeft: 'auto' }} >` | TBD | |
| `modules\today\MovementList.tsx` | `Link (clickable): {label}` | TBD | |
| `modules\today\MovementList.tsx` | `div (clickable): setHover(r.id)} onMouseLeave={() => setHover((h) => (h === r.id ? null : h))} on...` | TBD | |
| `modules\today\MovementList.tsx` | `Link (clickable): {r.bookingNo}` | TBD | |
| `modules\today\MovementList.tsx` | `Button: { e.stopPropagation() setMenu((x) => (x === r.id ? null : r.id)) }} style={{ border: 'non...` | TBD | |
| `modules\today\MovementList.tsx` | `Button: { e.stopPropagation() if (!act) return onClose() act() }} style={{ display: 'block', widt...` | TBD | |
| `modules\today\Today.tsx` | `Button: setMore((m) => !m)} aria-expanded={more} style={{ display: 'inline-flex', alignItems: 'ce...` | TBD | |
| `modules\today\Today.tsx` | `Button: navigate(`/calendar?d=${CAL_TODAY_ISO}`)} aria-label="Open the Calendar at today's date" ...` | TBD | |
| `modules\today\Today.tsx` | `Button: navigate('/rentals/new')}> New Rental` | TBD | |
| `modules\today\Today.tsx` | `Button: setPicked(() => [])} style={{ border: 'none', background: 'transparent', color: 'var(--li...` | TBD | |
| `modules\today\Today.tsx` | `Button: !dead && toggle(o)} aria-pressed={on} aria-disabled={dead ? true : undefined} title={dead...` | TBD | |

## 02 Rentals List

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\operations\CrewBooking.tsx` | `Button: showSuccessToast('Exporting', 'Generating crew payroll report...')} icon={} > Export` | TBD | |
| `modules\operations\CrewBooking.tsx` | `Button: showSuccessToast('Book Crew', 'Opening crew booking flow')} icon={} > Book Crew` | TBD | |
| `modules\operations\CrewBooking.tsx` | `Button (clickable, self-closing)` | TBD | |
| `modules\operations\CrewBooking.tsx` | `Button: navigate(`/rentals/${c.linkedBooking}`)}> View` | TBD | |
| `modules\operations\CrewBooking.tsx` | `Button: setActiveFilter(chip.label as FilterKey)} style={{ padding: '6px 14px', borderRadius: 20,...` | TBD | |
| `modules\operations\SubRental.tsx` | `Button: showSuccessToast('New Record', 'Opening Sub-Rental wizard')} icon={} > New Sub-Rental` | TBD | |
| `modules\operations\SubRental.tsx` | `Button: navigate(`/rentals/${c.linkedBooking}`) : undefined} > View` | TBD | |
| `modules\operations\SubRental.tsx` | `Button: showSuccessToast('Exporting', 'Generating sub-rental report...')} icon={} > Export` | TBD | |
| `modules\operations\SubRental.tsx` | `Button (clickable, self-closing)` | TBD | |
| `modules\operations\SubRental.tsx` | `Button: setActiveFilter(chip.label as FilterKey)} style={{ padding: '6px 14px', borderRadius: 20,...` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Record Payment` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Confirm Booking` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Add Member` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Operations` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Save Draft` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Receive Payment` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: navigate('/inventory') } : {})}>{a.action}` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Add Document` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Search` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Add Item` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Send Quote` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: {a}` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Edit` | TBD | |
| `modules\rentals\BookingDetail.tsx` | `Button: Filters` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: {u}` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: setCategory(c)} aria-pressed={on} style={{ display: 'flex', alignItems: 'center', gap: 8,...` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: setActive(p.id)} aria-label={`Preview ${p.file}, ${st}`} style={{ display: 'block', width...` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: setRemoving(null)}>Cancel` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: Mark as Review` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: {b}` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: setSelected([])} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', ...` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: {label}` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: Unmatch` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `button (clickable, self-closing)` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: { if (reason.trim().length ({ ...r, [current.id]: reason.trim() })) setRemoving(null) set...` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: { setRemoving(current.id); setReason('') }}> Remove` | TBD | |
| `modules\rentals\EvidenceWorkspace.tsx` | `Button: setFilter(f)} aria-pressed={on} style={{ height: 26, padding: '0 9px', borderRadius: 7, b...` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: setSelected(new Set(remaining.map((u) => u.id)))}>Select All Remaining` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: = 10 ? 'pointer' : 'not-allowed', ...(overrideReason.trim().length >= 10 ? BLUE_PRIMARY :...` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: Capture` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: setFilter(f)} aria-pressed={on} style={{ height: 26, padding: '0 9px', borderRadius: 7, b...` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: navigate(`/rentals/${id}`)} style={{ height: 34, padding: '0 14px', borderRadius: 'var(--...` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: Mark Cleared →` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: {primaryLabel}` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: handOverMany([...selected])}>Hand Over Selected ({selected.size})` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: setScanLog((p) => ['Scan Barcode opened', ...p].slice(0, 5))}>Scan Barcode` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `RowAction (clickable, self-closing)` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: {a}` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: {label}` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: handOverMany(remaining.map((u) => u.id))}>Bulk Scan` | TBD | |
| `modules\rentals\HandoverWorkspace.tsx` | `Button: undo(u.id)}>Undo` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: Add Member` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: Receive Payment` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: Operations` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: Save Draft` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: { if (a.action === 'Open Inventory') navigate('/inventory') }}>{a.action}` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: Client History` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: navigate('/clients/new')}>New Client` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: setLines((p) => p.filter((x) => x.id !== l.id))} style={{ border: 'none', background: 'tr...` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: setCrew([])}>Clear crew` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: !confirmBlocked && navigate('/rentals')}> Confirm Booking` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: Receive Deposit` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: Send Quote` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: {a}` | TBD | |
| `modules\rentals\NewRental.tsx` | `Button: navigate('/clients')}>Select Client` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: Print Packing List` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: setFilter(f)} aria-pressed={on} style={{ height: 26, padding: '0 9px', borderRadius: 7, b...` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: Swap Unit` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: Save Draft` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: Scan QR` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: setHighlight(highlight === g.name ? null : g.name)} style={{ display: 'flex', alignItems:...` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: {b}` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: navigate(`/rentals/${id}`)} style={{ height: 34, padding: '0 14px', borderRadius: 'var(--...` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: canComplete && navigate(`/rentals/${id}`)} style={{ display: 'inline-flex', alignItems: '...` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `RowAction (clickable, self-closing)` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: Bulk Scan` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: {a}` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: {label}` | TBD | |
| `modules\rentals\PackingWorkspace.tsx` | `Button: Scan Barcode` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: setOpen((o) => !o)} style={{ border: 'none', background: open ? 'var(--hover-card)' : 'tr...` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: More Filters` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: Save View` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: setView(v)} aria-pressed={on} style={{ display: 'inline-flex', alignItems: 'center', gap:...` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: Import` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: setView('Table')} style={{ border: 'none', background: 'transparent', color: 'var(--link)...` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: Save as new filter` | TBD | |
| `modules\rentals\RentalsList.tsx` | `PageBtn (clickable, self-closing)` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: Export` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: pickChip(c.label)} aria-pressed={on} style={{ display: 'inline-flex', alignItems: 'center...` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: setTab(t)} aria-current={on ? 'page' : undefined} style={{ height: 36, padding: '0 4px', ...` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: navigate('/rentals/new')}> New Rental` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: setSelected(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'transpa...` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: {label}` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: {g.label}` | TBD | |
| `modules\rentals\RentalsList.tsx` | `Button: { setFrom('') setTo('') }} > Clear range` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: setFilter(f)} aria-pressed={on} style={{ height: 28, padding: '0 10px', borderRadius: 7, ...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: Select All Visible` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: pickProblem(u.id, q)} style={{ height: 26, borderRadius: 6, fontSize: 'var(--t-meta)', fo...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: confirmProblem(u.id)} style={{ height: 26, padding: '0 9px', borderRadius: 6, border: '1p...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: Pass` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: cancelProblem(u.id)} style={{ height: 26, padding: '0 9px', borderRadius: 6, border: '1px...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: setMode(m)} aria-pressed={mode === m} style={{ flex: 1, height: 30, borderRadius: 'var(--...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: Clear` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: Clear Selection` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: navigate(`/rentals/${id}`)} style={{ height: 34, padding: '0 14px', borderRadius: 'var(--...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: Mark Clean &amp; Move to QC` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: Fail` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: canCompleteJob && setJobCompletedAt('—')} style={{ display: 'inline-flex', alignItems: 'c...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `RowAction (clickable, self-closing)` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: changeProblemField(u.id, { evidence: draft.evidence + 1 })}> Add Evidence Photo ({draft.e...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: setPriorityOnly((p) => !p)} aria-pressed={priorityOnly} title="Priority is a flag, not a ...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Card (clickable): Select All Visible} > {['', 'Equipment', 'Serial', 'Category', 'Status', 'Assig...` | TBD | |
| `modules\rentals\ResetWorkspace.tsx` | `Button: {label}` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: setScanLog((p) => ['Scan Barcode opened', ...p].slice(0, 5))} style={{ ...bigScanBtn, ......` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: Cancel` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: setScanLog((p) => ['Scan QR opened', ...p].slice(0, 5))} style={{ ...bigScanBtn, backgrou...` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: navigate(`/rentals/${id}`)} style={{ height: 34, padding: '0 14px', borderRadius: 'var(--...` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: onSetAccessory(a.name, true)} style={{ ...miniToggle(a.present === true, 'in'), flexShrin...` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: Capture` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: {primaryLabel}` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: Print Return Report` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: undoMissing(u.id)}>Undo — Mark Outstanding` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: Save Inspection` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: Send for Manager Approval` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: setFilter(f)} aria-pressed={on} style={{ height: 26, padding: '0 9px', borderRadius: 7, b...` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: onSetCondition(c)} style={{ height: 26, padding: '0 9px', borderRadius: 6, border: `1px s...` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `RowAction (clickable, self-closing)` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: {a}` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: onSetAccessory(a.name, false)} style={{ ...miniToggle(a.present === false, 'danger'), fle...` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: {label}` | TBD | |
| `modules\rentals\ReturnWorkspace.tsx` | `Button: Resolve →` | TBD | |

## 03 Calendar

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\calendar\Calendar.tsx` | `Button: navigate(`/rentals/${bookingNo}`)}> {a.label}` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: Clear All` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: setShowFilters((v) => !v)}>{showFilters ? 'Hide Filters' : 'Filters'}` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: setFull(true)}>Full View` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: View Conflicts` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: stepZoom(-1)} title="Show fewer days" style={iconBtn} aria-label="Zoom in">` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: Today` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: step(1)} disabled={!nextOk} title={nextOk ? 'Next month' : 'The Date Engine only vouches ...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: runQuickAction(a)} title={a.to ? `Go to ${a.to}` : 'Filter the timeline to conflicts'} st...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: stepZoom(1)} title="Show more days" style={iconBtn} aria-label="Zoom out">` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: onSelect(bar.id)} title={`${bar.kind} · ${bar.label}${bar.sub ? ` · ${bar.sub}` : ''}${wh...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: toggleKind(k)} aria-pressed={on} title={on ? `Stop filtering by ${k}` : `Show only ${k}`}...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: {icon && } {label} {reason}` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: k.link && navigate(k.link.to)} style={{ marginTop: 'auto', paddingTop: 8, background: 'no...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: {labelHeading} {itemCount} items` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: shift(-1)} title="Previous range" style={iconBtn}>` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: applySavedView(v.name)} aria-pressed={on} style={{ display: 'flex', alignItems: 'center',...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: setFull(false)}>Exit Full View` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: { setZoom(DEFAULT_ZOOM); goToday() }} title="Back to a 7-day window on today" style={{ .....` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: navigate('/rentals/new')}> New Rental` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: shift(1)} title="Next range" style={iconBtn}>` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: onPickDay(d)} title={`${bs ? formatBs(bs) : ''} · ${formatAd(d)}${hol ? ` · ${hol.name}` ...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: setView(v)} aria-pressed={on} style={{ height: 28, padding: '0 11px', borderRadius: 7, bo...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: navigate(`/rentals/${bar.label}`)}> Open Booking` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: setKinds(new Set())} style={{ ...chipBase, border: '1px solid var(--border)', background:...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: onPickDay(d)} title={`Open ${bs ? formatBs(bs) : ''} · ${formatAd(d)}`} style={{ minHeigh...` | TBD | |
| `modules\calendar\Calendar.tsx` | `Button: step(-1)} disabled={!prevOk} title={prevOk ? 'Previous month' : 'The Date Engine only vou...` | TBD | |

## 04 Inventory

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\inventory\AddBundle.tsx` | `Banner (clickable): Refresh rates } > {drift .map((d) => `${d.model.name} ${formatMoney(d.from)} ...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: Clear All` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: showSuccessToast('Draft saved', `${BUNDLE_ID} · ${lines.length} lines held locally`)} > S...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: onAddChild(child)} title={`Add ${child.name} as its own line`} style={{ display: 'flex', ...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Section (clickable): {treeOpen.size === 0 ? 'Expand all' : 'Collapse all'} } > setSearch(e.target...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: Create Bundle` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Tile (clickable, self-closing)` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: setCrew((prev) => prev.filter((x) => x.role !== c.role))} style={{ border: 'none', backgr...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: setOverride((v) => !v)} aria-pressed={override} style={{ height: 34, padding: '0 11px', b...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: onPatch({ approvedBy: line.approvedBy ? null : approverName })} aria-pressed={!!line.appr...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: setActive((v) => !v)} aria-pressed={active} style={{ display: 'inline-flex', alignItems: ...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: fileRef.current?.click()}> {thumbnail ? 'Change image' : 'Add image'}` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: {model.name} {model.sku} {inBundle && in bundle}` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: {gate.valid ? 'Approved' : 'Needs approval'} ▾` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: navigate('/inventory')}>Cancel` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: Import Template` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: {a.label}` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Banner (clickable): Dismiss } > {duplicateNote}` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: setTags((prev) => prev.filter((x) => x !== t))} style={{ display: 'grid', placeItems: 'ce...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: { showSuccessToast( 'Bundle created', `${BUNDLE_ID} · ${breakdown.totalItems} items · ${f...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: setLines([])}> Clear All Items` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: Clear All Items` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: {line.childIds.length} ▾` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: setDuplicateNote(null)}> Dismiss` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: setBlockedOpen((v) => !v)} aria-expanded={blockedOpen} style={{ marginTop: 8, border: 'no...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: setLines((prev) => prev.map((l) => { const m = modelOf(l.modelId) return m ? { ...l, orig...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: setTreeOpen(treeOpen.size === 0 ? new Set(ROOT_MODELS.filter((m) => m.children).map((m) =...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: onPatch({ childIds: kids.filter((c) => !childIsLine(c.id)).map((c) => c.id) }) } style={{...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: onPatch({ childIds: [] })} style={{ border: 'none', background: 'transparent', color: 'va...` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: {label}` | TBD | |
| `modules\inventory\AddBundle.tsx` | `Button: Clear filters` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: handleSubmit('create')}> Create Equipment (not stored)` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" style={{ width: 34...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: { setDepositKind(k) }} aria-pressed={on} style={{ height: 32, padding: '0 12px', borderRa...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: navigate('/inventory')}> Open Inventory` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: setDismissedDuplicate(true)}> Continue Anyway` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: setContains((prev) => prev.filter((x) => x.id !== c.id))} aria-label={`Detach ${modelName...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: { addContained(containPick) setContainPick('') }} > Attach` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: removeUnit(u.id)} aria-label={`Remove unit ${i + 1}`} style={{ border: 'none', background...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: { URL.revokeObjectURL(d.url) setDocuments((prev) => prev.filter((x) => x.id !== d.id)) }}...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: Add Unit` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: setShowDiscard(false)}> Keep Editing` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: (isDirty ? setShowDiscard(true) : navigate('/inventory'))}> Cancel` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: thumbInput.current?.click()} style={{ width: 132, height: 100, borderRadius: 8, border: `...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `a (clickable): {i + 1} {sec.label}` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: Preview` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: Check Duplicates` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: galleryInput.current?.click()} style={{ width: 74, height: 60, borderRadius: 6, border: '...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: csvInput.current?.click()} icon="upload"> Import CSV` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: docInput.current?.click()}> Attach` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: Copy Asset Code` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: { if (requiresPick && !requires.includes(requiresPick)) setRequires((prev) => [...prev, r...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: { setTracking(t.mode) }} aria-pressed={on} style={{ padding: '10px 12px', borderRadius: 8...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: setMoreOpen((v) => !v)} aria-expanded={moreOpen} style={{ marginTop: 10, width: '100%', d...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: navigate('/inventory')}> Discard` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: { if (compatiblePick && !compatible.includes(compatiblePick)) setCompatible((prev) => [.....` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: { URL.revokeObjectURL(g.url) setGallery((prev) => prev.filter((x) => x.id !== g.id)) }} a...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: Generate Asset Tags` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: handleSubmit('draft')}> Save Draft (not stored)` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: addContained(s.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, paddin...` | TBD | |
| `modules\inventory\AddEquipment.tsx` | `Button: setQuantity((q) => q + 1)} aria-label="Increase quantity" style={{ width: 34, height: 36,...` | TBD | |
| `modules\inventory\AssetDetail.tsx` | `Button: setActiveTab(t)} style={{ padding: '8px 16px', borderRadius: 'var(--r-btn)', border: `1px...` | TBD | |
| `modules\inventory\AssetDetail.tsx` | `Button: setSelectedUnitForQr(u.serial)}>Label` | TBD | |
| `modules\inventory\AssetDetail.tsx` | `Button: navigate('/rentals/new')}> Book Asset` | TBD | |
| `modules\inventory\AssetDetail.tsx` | `Button: navigate('/inventory')}>Edit` | TBD | |
| `modules\inventory\AssetDetail.tsx` | `Button: toggleUnit(u.serial)} style={{ border: 'none', background: 'transparent', color: 'var(--m...` | TBD | |
| `modules\inventory\AssetDetail.tsx` | `Button: setSelectedUnitForQr(null)}>Close` | TBD | |
| `modules\inventory\AssetDetail.tsx` | `Button: setSelectedUnitForQr(null)}>Print Label Sheet` | TBD | |
| `modules\inventory\AssetDetail.tsx` | `Button: setSelectedUnitForQr(null)} style={{ border: 'none', background: 'transparent', cursor: '...` | TBD | |
| `modules\inventory\AssetDetail.tsx` | `Button: setSelectedUnitForQr(asset?.children?.[0]?.serial ?? 'SN-FX3-001')}> Print Labels` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: Clear All` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: Import` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: = pageCount} onClick={() => setPage(safePage + 1)}> Next` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: onToggleSerials(key)} aria-expanded={showSerials} style={{ display: 'inline-flex', alignI...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: toggleIn(expanded, setExpanded, b.id)} aria-expanded={open} style={{ display: 'inline-fle...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: navigate('/inventory/bundles/new')}> New Bundle` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: setPage(safePage - 1)}> Prev` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: setPreviewId(b.id)} aria-pressed={isPreview} title="Show this bundle in the preview rail"...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'transparent', border: ...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: navigate(`/rentals/${bundle.booking?.id}/packing`)} style={{ ...tile, cursor: 'pointer' }...` | TBD | |
| `modules\inventory\Bundles.tsx` | `button (clickable, self-closing)` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: { it.onSelect?.() setOpen(false) }} style={{ display: 'block', width: '100%', textAlign: ...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: View full breakdown ({facts.totalItems} items)` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: setView(v)} aria-pressed={view === v} aria-label={v === 'list' ? 'List view' : 'Grid view...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: onToggleGroup(`${bundle.id}:${g.name}`)} aria-expanded={open} style={{ display: 'flex', a...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: setSort((prev) => prev?.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, d...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: { setChip(c.label) setPage(1) }} aria-pressed={on} style={{ display: 'inline-flex', align...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: exportBundles(filtered, money)}> Export` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: setPreviewId(b.id)} aria-pressed={preview?.id === b.id} style={{ ...cardStyle, textAlign:...` | TBD | |
| `modules\inventory\Bundles.tsx` | `Button: exportOneBundle(bundle, money)} style={{ ...tile, cursor: 'pointer' }}> Export Lines` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: setSelected(new Set())} style={{ border: 'none', background: 'transparent', color: 'var(-...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: setView(v)} aria-pressed={view === v} aria-label={v === 'table' ? 'Table view' : 'Grid vi...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: toggleGroup(r.label)} aria-expanded={isOpen} style={{ ...rowBase, color: 'var(--text)', c...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: Save Current View` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: Clear Filters` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: setSort((s) => (s === 'Equipment A–Z' ? 'Equipment Z–A' : 'Equipment A–Z'))} style={{ dis...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: exportCsv(filtered, money)}> Export` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: Import` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: setTab(t)} aria-current={on ? 'page' : undefined} style={{ height: 34, padding: '0 13px',...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: setOpen((o) => !o)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${r...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))} aria-pressed={density =...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: setPage(n)} aria-current={on ? 'page' : undefined} style={{ minWidth: 26, height: 26, bor...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: navigate('/inventory/new')}> Add Equipment` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: { setChip(c.label) setPage(1) }} aria-pressed={on} style={{ display: 'inline-flex', align...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: Bulk Actions` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: setPage(b.to)} disabled={b.disabled} aria-label={b.name} style={{ minWidth: 26, height: 2...` | TBD | |
| `modules\inventory\Inventory.tsx` | `Button: Reset` | TBD | |
| `modules\inventory\Maintenance.tsx` | `Button: Open job` | TBD | |
| `modules\inventory\Maintenance.tsx` | `Button: Log Maintenance` | TBD | |
| `modules\inventory\Maintenance.tsx` | `Button: exportCsv(filteredRecords, money)}> Export` | TBD | |
| `modules\inventory\Maintenance.tsx` | `Button: setActiveFilter(c.label)} aria-pressed={activeFilter === c.label} style={chipStyle(active...` | TBD | |
| `modules\inventory\Maintenance.tsx` | `Button: setActiveFilter(c.key)} aria-pressed={on} title={c.title} style={{ display: 'inline-flex'...` | TBD | |
| `modules\inventory\Maintenance.tsx` | `Button: Clear filters` | TBD | |
| `modules\inventory\PurchaseRequests.tsx` | `Button: } onClick={() => handleStatusChange(activePR.id, 'Approved')} style={{ flex: 1 }}> Approv...` | TBD | |
| `modules\inventory\PurchaseRequests.tsx` | `Button: handleStatusChange(activePR.id, 'Rejected')} style={{ flex: 1, color: 'var(--danger-text)...` | TBD | |
| `modules\inventory\PurchaseRequests.tsx` | `Button: }> New Draft PR` | TBD | |
| `modules\inventory\PurchaseRequests.tsx` | `Button: setActiveTab(t)} style={{ padding: '6px 14px', borderRadius: 6, background: activeTab ===...` | TBD | |
| `modules\inventory\PurchaseRequests.tsx` | `Button: }> Filter` | TBD | |
| `modules\inventory\PurchaseRequests.tsx` | `Button: setSelectedPrId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', co...` | TBD | |
| `modules\inventory\PurchaseRequests.tsx` | `Card (clickable): } > Equipment {activePR.fleetItemName} (x{activePR.requestedQty}) Category: {ac...` | TBD | |
| `modules\inventory\PurchaseRequests.tsx` | `Button: } onClick={() => handleStatusChange(activePR.id, 'Ordered')} style={{ flex: 1 }}> Mark as...` | TBD | |
| `modules\inventory\PurchaseRequests.tsx` | `tr (clickable): {pr.prNo} {pr.fleetItemName} {pr.reason} {pr.requestedQty} {pr.priority} {rupees(...` | TBD | |
| `modules\inventory\StockCheck.tsx` | `Button: setFilterMode(tab.id)} style={{ padding: '4px 10px', borderRadius: 4, background: active ...` | TBD | |
| `modules\inventory\StockCheck.tsx` | `Button: { setScanInput(u.serial) }} > Manual Verify` | TBD | |
| `modules\inventory\StockCheck.tsx` | `Button: { setScanInput(u.serial) }} style={{ padding: '4px 8px', borderRadius: 4, background: 'va...` | TBD | |
| `modules\inventory\StockCheck.tsx` | `Button: } onClick={handleFinishAudit} > Reconcile & Complete Audit` | TBD | |
| `modules\inventory\StockCheck.tsx` | `Button: navigate('/inventory')}> Exit Session` | TBD | |
| `modules\inventory\StockCheck.tsx` | `Button: setScanInput('SN-AP6-UNKNOWN-99')} style={{ padding: '4px 8px', borderRadius: 4, backgrou...` | TBD | |
| `modules\inventory\StockCheck.tsx` | `Button: } onClick={handleScanSubmit}> Scan` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: Refresh` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: openWarehouse(w.id)}> Open` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setPage(safePage + 1)} disabled={safePage === pageCount} aria-label="Next page" style={{ ...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: { setSort({ key: 'occupancy', dir: 'desc' }) setPage(1) focusList() }} > Rank warehouses ...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: { setStatus('Active') setPage(1) focusList() }} > View Active` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setModalOpen(true)}> Create Transfer` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: openWarehouse(w.id)}> View Warehouse` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setModalOpen(true)}> Transfer Stock` | TBD | |
| `modules\inventory\Warehouses.tsx` | `div (clickable): e.stopPropagation()} style={{ ...cardStyle, background: 'var(--modal)', boxShado...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: Print Labels` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: Create Transfer` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: advance(t.id, 'Cancelled')}> Cancel` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setView(v)} aria-pressed={view === v} aria-label={v === 'table' ? 'Table view' : 'Card vi...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setModalOpen(false)} aria-label="Close" style={{ marginLeft: 'auto', border: 'none', back...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setPage(safePage - 1)} disabled={safePage === 1} aria-label="Previous page" style={{ minW...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setProfileTab(t.id)} aria-current={on ? 'page' : undefined} style={{ height: 36, padding:...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setPage(n)} aria-current={on ? 'page' : undefined} style={{ minWidth: 26, height: 26, bor...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: View All` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: openWarehouse(w.id)} aria-label={`Open ${w.name}`} title={`Open ${w.name}`} style={{ widt...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: Ask` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: exportCsv(filtered)}> Export` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: Open Transfer Center` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: advance(t.id, flow.next)}> {flow.label}` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setAlertFilter(null)}> Clear` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: {tile}` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: Add Warehouse` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: toggleSort(c.key)} aria-label={`Sort by ${c.header}`} style={{ display: 'inline-flex', al...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: applyAlert(a.key)} title={a.rule} aria-pressed={on} style={{ display: 'flex', alignItems:...` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: setModalOpen(false)}>Cancel` | TBD | |
| `modules\inventory\Warehouses.tsx` | `Button: View Transfers` | TBD | |
| `modules\inventory\components\AddEquipmentContext.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\inventory\components\BundleItemsTable.tsx` | `Button: toggleItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', ...` | TBD | |
| `modules\inventory\components\BundleItemsTable.tsx` | `Button: updateItem(item.id, 'discMode', item.discMode === '%' ? 'Rs' : '%')} style={{ padding: '0...` | TBD | |
| `modules\inventory\components\BundleItemsTable.tsx` | `Button: Clear All Items` | TBD | |
| `modules\inventory\components\BundleSummaryRail.tsx` | `Button: Preview` | TBD | |
| `modules\inventory\components\BundleSummaryRail.tsx` | `Button: View all blocked items ({availability.blockedItemsList.length})` | TBD | |
| `modules\inventory\components\BundleSummaryRail.tsx` | `Button: Duplicate` | TBD | |
| `modules\inventory\components\BundleSummaryRail.tsx` | `Button: More` | TBD | |
| `modules\inventory\components\InventoryTree.tsx` | `Button: Select All` | TBD | |
| `modules\inventory\components\InventoryTree.tsx` | `Button: Collapse All` | TBD | |
| `modules\inventory\components\InventoryTree.tsx` | `div (clickable): { if (e.key === 'Enter' \|\| e.key === ' ') toggleItem(child.id) }} style={{ paddi...` | TBD | |
| `modules\inventory\components\InventoryTree.tsx` | `div (clickable): { if (e.key === 'Enter' \|\| e.key === ' ') toggleItem(parent.id) }} style={{ padd...` | TBD | |

## 05 Clients

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\clients\AddClient.tsx` | `Button: navigate('/clients')}> Discard` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: {saved ? 'Client Saved' : saving ? 'Saving Client…' : 'Save Client'}` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: setShowDiscard(false)}> Keep Editing` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: Cancel` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: toggleProfession(p)} aria-pressed={on} style={{ padding: '6px 12px', borderRadius: 999, f...` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: duplicateMatch && navigate(`/clients/${duplicateMatch.id}`)}> View Existing` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: setClientType(opt.value)} aria-pressed={on} style={{ flex: '1 1 100px', display: 'flex', ...` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: fileInputRef.current?.click()}> Browse Files` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: setDocuments((prev) => prev.filter((x) => x.id !== d.id))} aria-label={`Remove ${d.file.n...` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: toggleSegment(s)} aria-pressed={on} style={{ padding: '6px 12px', borderRadius: 999, font...` | TBD | |
| `modules\clients\AddClient.tsx` | `Button: setDismissedDuplicate(true)}> Continue Anyway` | TBD | |
| `modules\clients\ClientDetail.tsx` | `Button: Unblock Client` | TBD | |
| `modules\clients\ClientDetail.tsx` | `Button: Edit Client` | TBD | |
| `modules\clients\ClientDetail.tsx` | `Button: Add Note` | TBD | |
| `modules\clients\ClientDetail.tsx` | `Button: Block Client` | TBD | |
| `modules\clients\ClientDetail.tsx` | `Button: setShowBlockModal(false)}> Cancel` | TBD | |
| `modules\clients\ClientDetail.tsx` | `Button: setTab(t.key)} aria-current={on ? 'page' : undefined} style={{ height: 34, padding: '0 12...` | TBD | |
| `modules\clients\ClientDetail.tsx` | `Button: navigate('/rentals/new')}> Start Rental` | TBD | |
| `modules\clients\ClientDetail.tsx` | `Button: Start Rental` | TBD | |
| `modules\clients\ClientDetail.tsx` | `Button: navigate('/clients/duplicates')}> Merge Duplicate` | TBD | |
| `modules\clients\Clients.tsx` | `Button: navigate('/clients/referral/new')}> Generate Referral Code` | TBD | |
| `modules\clients\Clients.tsx` | `Button: Export` | TBD | |
| `modules\clients\Clients.tsx` | `Button: navigate('/clients/new')}> New Client` | TBD | |
| `modules\clients\Clients.tsx` | `Button: navigate('/clients/import')}> Import` | TBD | |
| `modules\clients\Clients.tsx` | `Button: setTab(t.key)} aria-current={on ? 'page' : undefined} style={{ height: 34, padding: '0 12...` | TBD | |
| `modules\clients\Clients.tsx` | `Button: navigate('/clients/duplicates')}> Find Duplicates` | TBD | |
| `modules\clients\Clients.tsx` | `Button: Request Override` | TBD | |
| `modules\clients\Clients.tsx` | `Card (clickable): Generate Referral Code } bodyStyle={{ padding: 0 }} > Referrer Referral Code Ne...` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: Save Current View` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: setView(v)} > {v}` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: Export Selected` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: setOpenMenuId(openMenuId === client.id ? null : client.id)} style={{ border: 'none', back...` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `tr (clickable): e.stopPropagation()}> setSelectedRowIds((prev) => { const next = new Set(prev) if...` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: setShowBulkBlock(false)}> Cancel` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: navigate('/finance')}> Ledger` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: setShowBulkBlock(true)}> Block Selected` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: {action.label}` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: Block {selectedClients.length} Client{selectedClients.length === 1 ? '' : 's'}` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: setSelectedRowIds(new Set())} style={{ border: 'none', background: 'transparent', color: ...` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: { setActiveFilter(v.filter) setSort(v.sort) setActiveSavedView(v.label) resetPage() }} ar...` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: setSelectedClientId(client.id)}>Profile` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: Clear all` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: Ledger` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: More Filters` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: applyFilter(c.key)} aria-pressed={on} style={{ display: 'inline-flex', alignItems: 'cente...` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: setSelectedClientId(null)} style={{ border: 'none', background: 'transparent', color: 'va...` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `PageBtn (clickable, self-closing)` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: Start rental` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Card (clickable): Clear all } bodyStyle={{ padding: 8 }} > {filterGroups.map((g) => ( {g.label} ))}` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: navigate('/rentals/new')}> Start rental` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: onSort(sortKey)} aria-label={`Sort by ${label}`} style={{ display: 'inline-flex', alignIt...` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: { setOpenMenuId(null) item.run() }} style={{ display: 'flex', alignItems: 'center', gap: ...` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: navigate(`/clients/${selectedClient.id}`)}> View Full Profile` | TBD | |
| `modules\clients\ClientsDirectory.tsx` | `Button: {label}` | TBD | |
| `modules\clients\DuplicateCenter.tsx` | `Button: onRequestMerge(survivorId)}> Merge into selected` | TBD | |
| `modules\clients\DuplicateCenter.tsx` | `Button: navigate('/clients')}> Back to Clients` | TBD | |
| `modules\clients\DuplicateCenter.tsx` | `Button: setPendingMerge(null)}> Cancel` | TBD | |
| `modules\clients\DuplicateCenter.tsx` | `Button: Confirm Merge` | TBD | |
| `modules\clients\DuplicateCenter.tsx` | `Button: Not a Duplicate` | TBD | |
| `modules\clients\GenerateReferralCode.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\clients\GenerateReferralCode.tsx` | `Button: {saved ? 'Code Generated' : saving ? 'Generating…' : 'Create Referral Code'}` | TBD | |
| `modules\clients\GenerateReferralCode.tsx` | `Button: Cancel` | TBD | |
| `modules\clients\ImportCenter.tsx` | `Button: {imported ? 'Imported' : importing ? 'Importing…' : `Import ${readyRows.length} Client${r...` | TBD | |
| `modules\clients\ImportCenter.tsx` | `Button: Choose Different File` | TBD | |
| `modules\clients\ImportCenter.tsx` | `Button: navigate('/clients')}> Back to Clients` | TBD | |
| `modules\clients\ImportCenter.tsx` | `Button: Download a sample CSV` | TBD | |
| `modules\clients\Membership.tsx` | `Button: View members` | TBD | |
| `modules\clients\Membership.tsx` | `Button: navigate('/settings')}> Settings` | TBD | |
| `modules\clients\Membership.tsx` | `Button: { if (!on) navigate(`/clients?tab=${t.toLowerCase()}`) }} aria-current={on ? 'page' : und...` | TBD | |
| `modules\clients\Membership.tsx` | `Button: More filters` | TBD | |
| `modules\clients\Membership.tsx` | `PageBtn (clickable, self-closing)` | TBD | |
| `modules\clients\Membership.tsx` | `Button: {b}` | TBD | |
| `modules\clients\Membership.tsx` | `Button: setPlanView(v)}> {v}` | TBD | |
| `modules\clients\Membership.tsx` | `Button: Edit Plans` | TBD | |
| `modules\clients\Membership.tsx` | `Button: { setBucket(c.bucket) resetPage() }} aria-pressed={on} style={{ display: 'inline-flex', a...` | TBD | |
| `modules\clients\Membership.tsx` | `Button: { setRenewingSoon((v) => !v) resetPage() }} > Renews within 30 days` | TBD | |
| `modules\clients\Membership.tsx` | `Button: Export` | TBD | |
| `modules\clients\Membership.tsx` | `Button: { setLevel(null) resetPage() }} style={{ marginLeft: 'auto', border: 'none', background: ...` | TBD | |
| `modules\clients\Membership.tsx` | `Button: navigate(`/clients?q=${encodeURIComponent(m.name)}`)} style={{ border: 'none', background...` | TBD | |
| `modules\clients\Membership.tsx` | `Button: setSelected(new Set())} style={{ border: 'none', background: 'transparent', color: 'var(-...` | TBD | |
| `modules\clients\Membership.tsx` | `Button: {label}` | TBD | |
| `modules\clients\Membership.tsx` | `Button: New Membership` | TBD | |
| `modules\reports\ClientReports.tsx` | `Button: setChip(p)} aria-pressed={on} style={{ height: 30, padding: '0 11px', borderRadius: 8, bo...` | TBD | |
| `modules\reports\ClientReports.tsx` | `Button: This Month` | TBD | |
| `modules\reports\ClientReports.tsx` | `Button: Export` | TBD | |
| `modules\reports\ClientReports.tsx` | `Button: Saved Views` | TBD | |
| `modules\reports\ClientReports.tsx` | `Button: Compare` | TBD | |
| `modules\reports\ClientReports.tsx` | `span (clickable): (Icon/No text)` | TBD | |
| `modules\reports\ClientReports.tsx` | `Button: {p}` | TBD | |
| `modules\reports\ClientReports.tsx` | `Button: {f}` | TBD | |
| `modules\reports\ClientReports.tsx` | `Button: Schedule Report` | TBD | |
| `modules\reports\ClientReports.tsx` | `Button: Filters` | TBD | |

## 06 Operations Queues

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\operations\CasesQueue.tsx` | `article (clickable): {c.id} {c.type} {c.title} {c.counterpartyKind} · {c.counterpartyName} {c.fla...` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: setOpen((o) => !o)} aria-label={`More actions for ${caseId}`} aria-haspopup="menu" style=...` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: setPage((p) => Math.max(1, p - 1))} style={pagerBtn(false)}> ‹` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: = pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} style={pagerBtn(f...` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: setChecked(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'transpar...` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: {label}` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: Export` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: setNewCaseNote(false)} style={{ marginLeft: 'auto', border: 'none', background: 'transpar...` | TBD | |
| `modules\operations\CasesQueue.tsx` | `tr (clickable): { if (e.key === 'Enter' \|\| e.key === ' ') { e.preventDefault() selectRow(c.id) } ...` | TBD | |
| `modules\operations\CasesQueue.tsx` | `div (clickable): {items.map((label) => ( {label} ))}` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: setPage(p)} style={pagerBtn(p === pageSafe)} aria-current={p === pageSafe}> {p}` | TBD | |
| `modules\operations\CasesQueue.tsx` | `div (clickable, self-closing)` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: setFilter(s)} aria-pressed={on} style={{ height: 30, padding: '0 12px', borderRadius: 8, ...` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: toggleFlag(f)} aria-pressed={on} style={{ display: 'inline-flex', alignItems: 'center', g...` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: setNewCaseNote(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, heig...` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: { setStatusFilter('All') setFlagFilter(null) setPage(1) }} > Clear Filters` | TBD | |
| `modules\operations\CasesQueue.tsx` | `Button: Confirm Disposition` | TBD | |
| `modules\operations\CasesWorkspace.tsx` | `Button: showSuccessToast('New Case', 'Opening case logging workspace')} icon={} > Log Incident` | TBD | |
| `modules\operations\CasesWorkspace.tsx` | `Button: navigate(CASE_WORKSPACE_ROUTE(c.id))}> Open Case` | TBD | |
| `modules\operations\CasesWorkspace.tsx` | `Button (clickable, self-closing)` | TBD | |
| `modules\operations\CasesWorkspace.tsx` | `Button: showSuccessToast('Exporting', 'Generating cases report...')} icon={} > Export` | TBD | |
| `modules\operations\CasesWorkspace.tsx` | `Button: setActiveFilter(chip.label as FilterKey)} style={{ padding: '6px 14px', borderRadius: 20,...` | TBD | |
| `modules\operations\OperationsQueues.tsx` | `Button: Refresh` | TBD | |
| `modules\operations\OperationsQueues.tsx` | `Button: { if ((j.job as string) === 'Cases') { navigate('/operations/cases') } else { navigate(`/...` | TBD | |
| `modules\operations\OperationsQueues.tsx` | `Button: setActive(on ? null : q.job)} aria-pressed={on} className="lift" style={{ ...cardStyle, p...` | TBD | |
| `modules\operations\OperationsQueues.tsx` | `Button: { if ((j.job as string) === 'Cases') { navigate('/operations/cases') } else { navigate(`/...` | TBD | |
| `modules\operations\OperationsQueues.tsx` | `Card (clickable): Clear filter : undefined} bodyStyle={{ padding: tabular ? 0 : 10 }} > {jobs.len...` | TBD | |
| `modules\operations\OperationsQueues.tsx` | `Button: setActive(null)}>Clear filter` | TBD | |
| `modules\operations\OperationsQueues.tsx` | `Button: Scan Item` | TBD | |
| `modules\operations\OperationsShell.tsx` | `div (clickable): {shellChrome}` | TBD | |
| `modules\operations\OperationsShell.tsx` | `Button: setStep(job)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding...` | TBD | |
| `modules\operations\OperationsShell.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\operations\OperationsShell.tsx` | `div (clickable, self-closing)` | TBD | |
| `modules\operations\shell\EvidencePanel.tsx` | `Button: setPhotos((prev) => [...prev, { id: `ph-${prev.length + 1}`, kind: 'condition' }])} style...` | TBD | |
| `modules\operations\shell\EvidencePanel.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\operations\shell\EvidencePanel.tsx` | `div (clickable, self-closing)` | TBD | |
| `modules\operations\shell\EvidencePanel.tsx` | `div (clickable): Evidence · {direction === 'out' ? 'Outbound (packing)' : 'Inbound (return)'}` | TBD | |
| `modules\operations\shell\OperationsShell.tsx` | `Button: setStep(s.key)} aria-current={active ? 'step' : undefined} aria-selected={active} aria-la...` | TBD | |
| `modules\operations\shell\OperationsShell.tsx` | `Button: { u.run() resolveUndo(u.id) }} style={{ minHeight: 44, padding: '0 10px', border: 'none',...` | TBD | |
| `modules\operations\shell\OperationsShell.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\operations\shell\OperationsShell.tsx` | `div (clickable, self-closing)` | TBD | |
| `modules\operations\shell\OperationsShell.tsx` | `div (clickable): {/* §3 — "~90% of the content area." Width is 90% of *this wrapper*, which is al...` | TBD | |
| `modules\operations\shell\steps\HandoverStep.tsx` | `Button: setCorrectingId(correctingId === it.id ? null : it.id)} style={{ height: 44, padding: '0 ...` | TBD | |
| `modules\operations\shell\steps\HandoverStep.tsx` | `Button: onEvidenceOpenChange(true)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems...` | TBD | |
| `modules\operations\shell\steps\HandoverStep.tsx` | `Button: { onAttemptEditLocked(it.id, parsedQty, correctionReason.trim()) setCorrectingId(null) se...` | TBD | |
| `modules\operations\shell\steps\HandoverStep.tsx` | `Button: Sign &amp; Lock Packing` | TBD | |
| `modules\operations\shell\steps\PackingStep.tsx` | `Button: setSubstituting(substituting === it.id ? null : it.id)} style={{ ...btnStyle, background:...` | TBD | |
| `modules\operations\shell\steps\PackingStep.tsx` | `Button: { const qty = Number(shortQty[it.id] ?? it.qtyExpected) onPack(it.id, { qty }) flash(it.i...` | TBD | |
| `modules\operations\shell\steps\PackingStep.tsx` | `Button: onPack(it.id, { serial: it.bookingSerial, qty: 1 })} style={btnStyle}> Pack as booked` | TBD | |
| `modules\operations\shell\steps\PackingStep.tsx` | `Button: { if (!substituteValue.trim()) return onPack(it.id, { serial: substituteValue.trim(), qty...` | TBD | |
| `modules\operations\shell\steps\ReturnStep.tsx` | `Button: receive(it.id, c)} style={{ height: 44, padding: '0 12px', borderRadius: 'var(--r-btn)', ...` | TBD | |
| `modules\operations\shell\steps\ReturnStep.tsx` | `Button: onEvidenceOpenChange(true)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems...` | TBD | |

## 07 Payments

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\finance\Finance.tsx` | `Button: Record Payment` | TBD | |
| `modules\finance\Finance.tsx` | `Button: setTab(t)} aria-current={on ? 'page' : undefined} style={{ height: 34, padding: '0 13px',...` | TBD | |
| `modules\finance\Finance.tsx` | `Button: Export` | TBD | |

## 09 Documents

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\documents\Documents.tsx` | `Button: Clear All` | TBD | |
| `modules\documents\Documents.tsx` | `Button: Import` | TBD | |
| `modules\documents\Documents.tsx` | `Button: Create Document` | TBD | |
| `modules\documents\Documents.tsx` | `Button: setSort(key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'non...` | TBD | |
| `modules\documents\Documents.tsx` | `Button: {b}` | TBD | |
| `modules\documents\Documents.tsx` | `Button: {q.label}` | TBD | |
| `modules\documents\Documents.tsx` | `div (clickable): Upload Document Import Export Create Document } /> {/* §2 — tabs. The rail's cat...` | TBD | |
| `modules\documents\Documents.tsx` | `Button: pickCategory('Templates')} style={{ display: 'flex', alignItems: 'center', justifyContent...` | TBD | |
| `modules\documents\Documents.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\documents\Documents.tsx` | `Card (clickable): Clear All } > Date Range { setFrom(e.target.value) setPage(1) }} style={fieldSt...` | TBD | |
| `modules\documents\Documents.tsx` | `Button: setCards(isCards)} aria-pressed={on} aria-label={`${label} view`} title={`${label} view`}...` | TBD | |
| `modules\documents\Documents.tsx` | `Button: pickCategory(t.key)} aria-current={on ? 'page' : undefined} style={{ height: 36, padding:...` | TBD | |
| `modules\documents\Documents.tsx` | `PageBtn (clickable, self-closing)` | TBD | |
| `modules\documents\Documents.tsx` | `Button: Export` | TBD | |
| `modules\documents\Documents.tsx` | `Button: { pickCategory('All') setStatus('Pending Signature') setPage(1) }} style={{ border: 'none...` | TBD | |
| `modules\documents\Documents.tsx` | `Button: Upload Document` | TBD | |
| `modules\documents\Documents.tsx` | `td (clickable): setMenuFor((m) => (m === d.id ? null : d.id))} />` | TBD | |
| `modules\documents\Documents.tsx` | `Card (clickable): View All } > {allDocs .filter((d) => d.status === 'Pending Signature' && !d.arc...` | TBD | |
| `modules\documents\Documents.tsx` | `Button: pickCategory(c.key)} aria-pressed={on} style={{ display: 'flex', alignItems: 'center', ga...` | TBD | |
| `modules\documents\Documents.tsx` | `Button: setSelected(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'transpa...` | TBD | |
| `modules\documents\Documents.tsx` | `Button: {label}` | TBD | |

## 10 Expenses

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\reports\ExpenseReports.tsx` | `Button: setPage(Math.min(pageCount, current + 1))} disabled={current === pageCount}> Next` | TBD | |
| `modules\reports\ExpenseReports.tsx` | `Button: Import` | TBD | |
| `modules\reports\ExpenseReports.tsx` | `Button: Clear` | TBD | |
| `modules\reports\ExpenseReports.tsx` | `Button: New Expense` | TBD | |
| `modules\reports\ExpenseReports.tsx` | `Button: Export` | TBD | |
| `modules\reports\ExpenseReports.tsx` | `Button: setPage(Math.max(1, current - 1))} disabled={current === 1}> Previous` | TBD | |
| `modules\reports\ExpenseReports.tsx` | `Button: { setCategory(c) setPage(1) }} aria-pressed={on} style={{ display: 'inline-flex', alignIt...` | TBD | |
| `modules\reports\ExpenseReports.tsx` | `Button: {a.label}` | TBD | |

## 11 Reports Finance

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\reports\CasesReports.tsx` | `Button: setPeriod(x)} aria-pressed={period === x} style={{ height: 30, padding: '0 11px', borderR...` | TBD | |
| `modules\reports\CasesReports.tsx` | `Button: {x}` | TBD | |
| `modules\reports\CasesReports.tsx` | `Button: Clear Filters` | TBD | |
| `modules\reports\CasesReports.tsx` | `tr (clickable): {r.map((cell, i) => 4 ? 'figure' : undefined} style={{ padding: '11px 10px', font...` | TBD | |
| `modules\reports\CasesReports.tsx` | `Button: Export` | TBD | |
| `modules\reports\CasesReports.tsx` | `Button: Saved Views` | TBD | |
| `modules\reports\CasesReports.tsx` | `Button: Compare` | TBD | |
| `modules\reports\CasesReports.tsx` | `Button: Schedule Report` | TBD | |
| `modules\reports\ProductReports.tsx` | `Button: setChip(p)} aria-pressed={on} style={{ height: 30, padding: '0 11px', borderRadius: 8, bo...` | TBD | |
| `modules\reports\ProductReports.tsx` | `Button: This Month` | TBD | |
| `modules\reports\ProductReports.tsx` | `span (clickable): { if (e.key === 'Enter' \|\| e.key === ' ') navigate('/inventory') }} style={{ .....` | TBD | |
| `modules\reports\ProductReports.tsx` | `span (clickable): { if (e.key === 'Enter' \|\| e.key === ' ') navigate('/inventory/stock-check') }}...` | TBD | |
| `modules\reports\ProductReports.tsx` | `Button: Export` | TBD | |
| `modules\reports\ProductReports.tsx` | `Button: Saved Views` | TBD | |
| `modules\reports\ProductReports.tsx` | `Button: Compare` | TBD | |
| `modules\reports\ProductReports.tsx` | `Button: {p}` | TBD | |
| `modules\reports\ProductReports.tsx` | `Button: {f}` | TBD | |
| `modules\reports\ProductReports.tsx` | `Button: Schedule Report` | TBD | |
| `modules\reports\ProductReports.tsx` | `Button: Filters` | TBD | |
| `modules\reports\Pulse.tsx` | `Button: periodRef.current?.focus()}> Edit date range` | TBD | |
| `modules\reports\Pulse.tsx` | `Button: setView(v)} aria-pressed={on} style={{ height: 28, padding: '0 10px', borderRadius: 'var(...` | TBD | |
| `modules\reports\Pulse.tsx` | `Button: exportCsv(figures, compareRange, user?.name ?? 'Unknown user')}> Export CSV` | TBD | |

## 12 Tools

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\settings\Tools.tsx` | `Button: setView(v)} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border...` | TBD | |
| `modules\settings\Tools.tsx` | `Button: More — show every tool →` | TBD | |
| `modules\settings\Tools.tsx` | `button (clickable, self-closing)` | TBD | |
| `modules\settings\Tools.tsx` | `Button: { e.preventDefault() e.stopPropagation() onToggle() }} style={{ width: 26, height: 26, di...` | TBD | |
| `modules\settings\Tools.tsx` | `Button: wrapping the card, favourite button inside — is * invalid HTML and a WCAG 2.2 nested-inte...` | TBD | |
| `modules\settings\Tools.tsx` | `Button: setOnlyFavourites((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap:...` | TBD | |
| `modules\settings\Tools.tsx` | `Button: {inner}` | TBD | |

## 13 Settings

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `modules\admin\AuditSettings.tsx` | `Button: Refresh` | TBD | |
| `modules\admin\AuditSettings.tsx` | `Button: Verify Logs` | TBD | |
| `modules\admin\AuditSettings.tsx` | `Button: Detailed` | TBD | |
| `modules\admin\AuditSettings.tsx` | `Button: Create Compliance Rule` | TBD | |
| `modules\admin\AuditSettings.tsx` | `Button: Create Audit Rule` | TBD | |
| `modules\admin\AuditSettings.tsx` | `Button: Export` | TBD | |
| `modules\admin\AuditSettings.tsx` | `Button: Manage Legal Holds` | TBD | |
| `modules\admin\AuditSettings.tsx` | `Button: {q.label}` | TBD | |
| `modules\admin\AuditSettings.tsx` | `Button: Add Retention Policy` | TBD | |
| `modules\admin\AuditSettings.tsx` | `Button: setState((s) => !s)} style={{ width: 30, height: 17, borderRadius: 999, border: 'none', p...` | TBD | |
| `modules\admin\BackupRestore.tsx` | `Button: Create Backup` | TBD | |
| `modules\admin\BackupRestore.tsx` | `Button: Refresh` | TBD | |
| `modules\admin\BackupRestore.tsx` | `Button: Select backup or restore point` | TBD | |
| `modules\admin\BackupRestore.tsx` | `Button: Start Restore` | TBD | |
| `modules\admin\BackupRestore.tsx` | `Button: Restore` | TBD | |
| `modules\admin\BackupRestore.tsx` | `Button: Export` | TBD | |
| `modules\admin\BackupRestore.tsx` | `Button: {q.label}` | TBD | |
| `modules\admin\BackupRestore.tsx` | `Button: {p}` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: Save Changes` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: Refresh` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: setModule(c.module ?? ALL_MODULES)} aria-pressed={on} style={{ display: 'flex', alignItem...` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: select(s.code)} aria-label={`Configure ${s.code} – ${s.name}`} title={`Load ${s.code} int...` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: Import` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: setTab(t)} aria-current={on ? 'page' : undefined} style={{ height: 28, padding: '0 10px',...` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: setDraft({ ...draft, active: !draft.active })} style={{ width: 32, height: 18, borderRadi...` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `PageBtn (clickable, self-closing)` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: Add Sequence` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: Export` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: Reset Counter` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: { setTestCount(5) previewRef.current?.scrollIntoView({ block: 'center' }) } : undefined }...` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: Run AI Analysis` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: setTestCount(testCount > 0 ? 0 : 5)}> {testCount > 0 ? 'Hide Test Numbers' : 'Test Next 5...` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: {label}` | TBD | |
| `modules\admin\NumberingSequences.tsx` | `Button: select(selected.code)}>Cancel` | TBD | |
| `modules\admin\SystemRestoreModal.tsx` | `Button: Proceed to Checkpoint` | TBD | |
| `modules\admin\SystemRestoreModal.tsx` | `Button: Verify Identity` | TBD | |
| `modules\admin\SystemRestoreModal.tsx` | `Button: Close & Reload` | TBD | |
| `modules\admin\SystemRestoreModal.tsx` | `Button: Execute Restore` | TBD | |
| `modules\admin\SystemRestoreModal.tsx` | `Button: Cancel` | TBD | |
| `modules\admin\SystemRestoreModal.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: Refresh` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: Edit Trigger` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: Test Trigger` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: Import` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: Clear` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: setHover(i)} onMouseLeave={() => setHover(null)} style={{ display: 'inline-flex', alignIt...` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: Export` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: {p}` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: {q.label}` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: Create Trigger` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: setTab(t)} aria-current={on ? 'page' : undefined} style={{ height: 27, padding: '0 8px', ...` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: {f}` | TBD | |
| `modules\automation\EventTriggers.tsx` | `Button: setRange(r)} aria-pressed={on} style={{ height: 22, padding: '0 8px', borderRadius: 6, bo...` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: Add Holiday` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Card (clickable): {all ? 'Show next 4' : `View all ${ordered.length}`} } > {shown.length === 0 ? ...` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: Export CSV` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: Export ICS` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Card (clickable): Add Shift } > Shift Name Time Break Departments Status {rows.map((s) => ( {s.na...` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: setView(v)} aria-pressed={active} style={{ height: 28, padding: '0 11px', borderRadius: '...` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: Add shift` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: setAll((v) => !v)} style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var...` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: {k.linkLabel}` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: Cancel` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: {q.label}` | TBD | |
| `modules\settings\BusinessHours.tsx` | `div (clickable): e.stopPropagation()} style={{ ...cardStyle, borderRadius: 'var(--r-modal)', boxS...` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: Add Shift` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: setScope(s)} style={{ height: 28, padding: '0 11px', borderRadius: 'var(--r-btn)', border...` | TBD | |
| `modules\settings\BusinessHours.tsx` | `Button: Add to calendar` | TBD | |
| `modules\settings\CommunicationSettings.tsx` | `Button: { setTab(t) setShowAll(false) }} style={{ height: 28, padding: '0 11px', borderRadius: 'v...` | TBD | |
| `modules\settings\CommunicationSettings.tsx` | `Button: Export Logs` | TBD | |
| `modules\settings\CommunicationSettings.tsx` | `Button: setShowAll((v) => !v)} style={controlStyle}> {showAll ? 'Show first 8' : `View all ${rows...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: { setTextSize(t.key) applyTextSize(t.key) }} aria-pressed={on} title={t.who \|\| undefined}...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: setPage(current + 1)} disabled={current === pageCount} aria-label="Next page" style={{ .....` | TBD | |
| `modules\settings\Settings.tsx` | `Button: Cancel` | TBD | |
| `modules\settings\Settings.tsx` | `Button: go(dest.tab)} style={style} {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}> {children}` | TBD | |
| `modules\settings\Settings.tsx` | `Button: go(t.key)} style={{ height: 36, padding: '0 13px', border: 'none', borderBottom: `2px sol...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: { setTouched(true) if (errors.length > 0) return onAdd({ id: `br-${code.toLowerCase()}`, ...` | TBD | |
| `modules\settings\Settings.tsx` | `Card (clickable): Back to all branches } > = 0 ? '+' : ''}${focusedBranch.growthPercent}%`, tone:...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: Export config` | TBD | |
| `modules\settings\Settings.tsx` | `Button: setMode(m)} aria-pressed={on} style={{ ...controlStyle, borderColor: on ? 'var(--nav-acti...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\settings\Settings.tsx` | `Button: {k.linkLabel}` | TBD | |
| `modules\settings\Settings.tsx` | `Button: setState((s) => !s)} style={{ width: 34, height: 19, borderRadius: 999, border: 'none', p...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: setAddOpen(true)}> Add Branch` | TBD | |
| `modules\settings\Settings.tsx` | `div (clickable): e.stopPropagation()} style={{ ...cardStyle, width: 520, maxWidth: '100%', maxHei...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: Export` | TBD | |
| `modules\settings\Settings.tsx` | `Button: { setFocused(b.id) setPage(1) }} style={{ ...controlStyle, width: '100%', justifyContent:...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: setFocused(null)} style={{ ...controlStyle, height: 28, fontSize: 'var(--t-th)' }}> Back ...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: Export CSV` | TBD | |
| `modules\settings\Settings.tsx` | `Button: {glyph} {label}` | TBD | |
| `modules\settings\Settings.tsx` | `Button: onSort(sortKey)} title={dir === 'asc' ? `Sorted by ${label}, ascending — click for descen...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: setPage(current - 1)} disabled={current === 1} aria-label="Previous page" style={{ ...con...` | TBD | |
| `modules\settings\Settings.tsx` | `Button: { setFocused(b.id) setPage(1) }} title={`Open the ${b.name} profile`} style={{ ...control...` | TBD | |
| `modules\settings\Timesheet.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\settings\Timesheet.tsx` | `Button: Manual Correction` | TBD | |
| `modules\settings\Timesheet.tsx` | `Button: Export CSV` | TBD | |

## Other/Shell

| File | Button/Label | Proposed Global Action | Notes |
|------|--------------|------------------------|-------|
| `components\shell\CommandPalette.tsx` | `div (clickable): setSelectedIndex(idx)} className={`flex items-center justify-between px-3.5 py-3...` | TBD | |
| `components\shell\CommandPalette.tsx` | `Button: setIsOpen(false)} className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-...` | TBD | |
| `components\shell\CommandPalette.tsx` | `div (clickable): {/* Search Header */} { setSearch(e.target.value) setSelectedIndex(0) }} onKeyDo...` | TBD | |
| `components\shell\CommandPalette.tsx` | `div (clickable, self-closing)` | TBD | |
| `components\shell\Header.tsx` | `Button: 12` | TBD | |
| `components\shell\Header.tsx` | `Button: (Icon/No text)` | TBD | |
| `components\shell\Header.tsx` | `Button: { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })) }} styl...` | TBD | |
| `components\shell\Header.tsx` | `Button: {initials} {user?.name \|\| 'Guest'} {user?.role \|\| ''} { e.stopPropagation(); handleLogout...` | TBD | |
| `components\shell\ScannerFab.tsx` | `Button: setOpen((v) => !v)} aria-label="Scanner" aria-expanded={open} style={{ width: 52, height:...` | TBD | |
| `components\shell\ScannerFab.tsx` | `Button: setContext(c.key)} aria-pressed={on} title={c.hint} style={{ height: 30, borderRadius: 7,...` | TBD | |
| `components\shell\ScannerFab.tsx` | `Button: setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', curso...` | TBD | |
| `components\shell\Sidebar.tsx` | `Button: setMode(m)} aria-pressed={on} style={{ display: 'inline-flex', alignItems: 'center', just...` | TBD | |
| `components\shell\Sidebar.tsx` | `Button: (Icon/No text)` | TBD | |
| `components\shell\Sidebar.tsx` | `Button: setMode(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ?...` | TBD | |
| `components\shell\Sidebar.tsx` | `Link (clickable): { if (!owned) e.currentTarget.style.background = 'var(--hover-sidebar)' }} onMo...` | TBD | |
| `components\ui\Button.tsx` | `Button: , { minHeight: number; padding: string; fontSize: string; gap: number; iconSize: number }...` | TBD | |
| `components\ui\Card.tsx` | `div (clickable): {label} {icon && {icon}}` | TBD | |
| `components\ui\CollapsibleAside.tsx` | `Button: (Icon/No text)` | TBD | |
| `components\ui\EvidenceThumbnail.tsx` | `div (clickable): {evidence.url ? ( ) : ( {isSignature ? : }` | TBD | |
| `components\ui\EvidenceThumbnail.tsx` | `div (clickable): {/* Header */} {evidence.title} Category: {evidence.category}` | TBD | |
| `components\ui\EvidenceThumbnail.tsx` | `Button: setIsOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 round...` | TBD | |
| `components\ui\EvidenceThumbnail.tsx` | `div (clickable, self-closing)` | TBD | |
| `components\ui\GateChecklist.tsx` | `Button: onToggleItem && onToggleItem(item.id, !item.passed)} className={`w-6 h-6 rounded-md flex ...` | TBD | |
| `components\ui\Input.tsx` | `Button: (Icon/No text)` | TBD | |
| `components\ui\IntelCard.tsx` | `Button: { e.stopPropagation() onPeek() }} style={{ flexShrink: 0, width: 26, height: 26, borderRa...` | TBD | |
| `components\ui\IntelCard.tsx` | `Link (clickable): {glance.primaryAction.label}` | TBD | |
| `components\ui\Modal.tsx` | `Button: (Icon/No text)` | TBD | |
| `components\ui\Modal.tsx` | `div (clickable, self-closing)` | TBD | |
| `components\ui\Modal.tsx` | `div (clickable): {/* Header */} {title && ( {title} )} {subtitle && ( {subtitle} )}` | TBD | |
| `components\ui\Page.tsx` | `Button: {icon && } {children}` | TBD | |
| `components\ui\ScannerInput.tsx` | `Button: Scan` | TBD | |
| `components\ui\StateViews.tsx` | `Button: {actionLabel}` | TBD | |
| `components\ui\StateViews.tsx` | `Button: Retry` | TBD | |
| `components\ui\Table.tsx` | `tr (clickable): {columns.map((col) => ( {col.render ? col.render(row, idx) : row[col.key] ?? '—'}...` | TBD | |
| `components\ui\Table.tsx` | `th (clickable): {col.header} {col.sortable && ( {isSorted ? ( sortDirection === 'asc' ? ( ) : ( )...` | TBD | |
| `components\ui\Toast.tsx` | `Button: removeToast(toast.id)} aria-label="Dismiss" style={{ border: 'none', background: 'transpa...` | TBD | |
| `components\ui\WarehouseMap.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\ai\AiAssistant.tsx` | `Button: Ask` | TBD | |
| `modules\ai\AiAssistant.tsx` | `Button: {p}` | TBD | |
| `modules\ai\AiAssistant.tsx` | `Button: New conversation` | TBD | |
| `modules\ai\AiAssistant.tsx` | `Button: { const route = suggestionRoute(s) if (route) navigate(route) }} > {s.action}` | TBD | |
| `modules\auth\HandoverSheet.tsx` | `Button: Hand over & log out` | TBD | |
| `modules\auth\HandoverSheet.tsx` | `Button: Skip` | TBD | |
| `modules\auth\Login.tsx` | `Button: handleNumpad(n.toString())} style={{ height: 56, borderRadius: 'var(--r-btn)', border: '1...` | TBD | |
| `modules\auth\Login.tsx` | `Button: handleNumpad('0')} style={{ height: 56, borderRadius: 'var(--r-btn)', border: '1px solid ...` | TBD | |
| `modules\auth\Login.tsx` | `Button: {mode === 'pin' ? 'Unlock' : 'Send OTP'}` | TBD | |
| `modules\auth\Login.tsx` | `Button: setMode(mode === 'pin' ? 'otp' : 'pin')} style={{ background: 'transparent', border: 'non...` | TBD | |
| `modules\auth\Login.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\auth\ScreenLock.tsx` | `Button: (Icon/No text)` | TBD | |
| `modules\auth\ScreenLock.tsx` | `Button: handleNumpad(n.toString())} style={{ height: 64, borderRadius: '50%', border: '1px solid ...` | TBD | |
| `modules\auth\ScreenLock.tsx` | `Button: { // Trigger actual logout window.location.href = '/login' }} style={{ marginTop: 40, bac...` | TBD | |
| `modules\auth\ScreenLock.tsx` | `Button: handleNumpad('0')} style={{ height: 64, borderRadius: '50%', border: '1px solid var(--bor...` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: Create New Segment` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: Add Channel` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: New Broadcast` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: More Variables` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: Duplicate` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: setPreview(p)} aria-pressed={on} style={{ height: 25, padding: '0 9px', borderRadius: 6, ...` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: Schedule Campaign` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: setHover(i)} onMouseLeave={() => setHover(null)} style={{ display: 'inline-flex', alignIt...` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: Export` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: {q.label}` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: All Campaigns` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: Filter` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: setTab(t.label)} aria-pressed={on} style={{ display: 'inline-flex', alignItems: 'center',...` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: {p}` | TBD | |
| `modules\notifications\BroadcastCenter.tsx` | `Button: (e.currentTarget.style.background = 'var(--hover-card)')} onMouseLeave={(e) => (e.current...` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: Create Template` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: Refresh` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: Send OTP` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: Broadcast SMS` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: New SMS` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: Export` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: {q.label}` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: {p}` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: Filter` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: All Types` | TBD | |
| `modules\notifications\SmsCenter.tsx` | `Button: {''}` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: setShowTemplateModal(true)} icon="checklist" > Templates` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: Receive Payment` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: Create Booking` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `div (clickable): e.stopPropagation()} > Approved Message Templates setShowTemplateModal(false)} s...` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: Use AI Draft` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: setSelectedChannel(ch)} style={{ display: 'flex', justifyContent: 'space-between', alignI...` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `div (clickable): {tpl.title} Category: {tpl.category}` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: setShowTemplateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--m...` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: setSelectedState(st)} style={{ display: 'flex', justifyContent: 'space-between', alignIte...` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Link (clickable): {c.linkedBookingId}` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `div (clickable): {c.unread && ( )} {c.clientName}` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: Open Operational Case` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: showToast('New conversation draft initiated')} icon="plus" > New Conversation` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: {isInternalNote ? 'Record Note' : 'Send'}` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: setSelectedChannel('All')} style={{ display: 'flex', justifyContent: 'space-between', ali...` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: setShowTemplateModal(false)}> Cancel` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: showToast('Opened Link to Client modal')} > Link to Client` | TBD | |
| `modules\notifications\UnifiedInbox.tsx` | `Button: setShowTemplateModal(true)} style={{ background: 'none', border: 'none', color: 'var(--pr...` | TBD | |
| `modules\system\SystemMonitor.tsx` | `Button: Export` | TBD | |
| `modules\system\SystemMonitor.tsx` | `Button: Refresh` | TBD | |

