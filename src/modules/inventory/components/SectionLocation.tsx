import Icon from '../../../components/ui/Icon'
import { Field, SectionCard, inputStyle, fieldRow } from './EquipmentShared'
import { useEquipmentContext } from './AddEquipmentContext'
import { locationLabel } from '../../../lib/queries/addEquipment'
import { useWarehouses } from '../../../lib/queries/warehouses'

export function SectionLocation() {
  /*
   * The warehouse list is READ FROM THE DATABASE, and must be.
   * `product_units.warehouse_id` is NOT NULL and `createEquipment` resolves the
   * choice against `warehouses`, so a picker built from `data/warehouse.ts`'s
   * four seed names offered nothing that existed: every serialised save failed
   * after this form had already reported "Ready to Rent — all gates clear".
   *
   * The BIN list below stays seed, deliberately. `storage_zones` has no room,
   * rack, shelf or bin column, so there is nothing to read; the chosen bin is
   * stored as free text on the unit with `storage_zone_id` left null, which is
   * what `createEquipment` already documents.
   */
  const { rows: warehouses, loading: warehousesLoading } = useWarehouses()

  const {
    warehouseId,
    setWarehouseId,
    locationId,
    setLocationId,
    warehouseLocations,
    chosenLocation,
    freeSlots,
    overCapacity,
    stockCount,
    errors,
    sectionNumber,
  } = useEquipmentContext()

  return (
    <SectionCard
            id="sec-location"
            n={sectionNumber('sec-location')}
            title="Location"
            note="Warehouse › Zone › Rack › Shelf › Bin. The container comes from Section 3, never typed here."
          >
            <div style={fieldRow}>
              <Field label="Warehouse" required error={errors.location}>
                <select
                  value={warehouseId}
                  onChange={(e) => {
                    setWarehouseId(e.target.value)
                    setLocationId('')
                  }}
                  style={inputStyle(Boolean(errors.location))}
                >
                  <option value="">
                    {warehousesLoading
                      ? 'Loading warehouses…'
                      : warehouses.length === 0
                        ? 'No active warehouse exists'
                        : 'Select a warehouse'}
                  </option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code ? `${w.name} (${w.code})` : w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Storage bin"
                required
                span={2}
                hint={
                  warehouseId
                    ? 'Bin labels are a seed list — storage_zones has no rack, shelf or bin column, so the choice is stored as text on the unit.'
                    : 'Choose a warehouse first.'
                }
              >
                <select
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value)
                  }}
                  disabled={!warehouseId}
                  style={{ ...inputStyle(Boolean(errors.location)), opacity: warehouseId ? 1 : 0.6 }}
                >
                  <option value="">{warehouseId ? 'Select a bin' : 'No warehouse selected'}</option>
                  {warehouseLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {locationLabel(l)} — {l.capacity - l.used} of {l.capacity} free
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {chosenLocation && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--sp-sm)',
                  padding: '9px 11px',
                  borderRadius: 'var(--r-sm)',
                  border: `1px solid ${overCapacity ? 'var(--danger)' : 'var(--border)'}`,
                  background: 'var(--card2)',
                }}
              >
                <Icon
                  name={overCapacity ? 'alert_triangle' : 'check'}
                  size={14}
                  style={{ color: overCapacity ? 'var(--danger-text)' : 'var(--success-text)', flexShrink: 0, marginTop: 2 }}
                />
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                  {locationLabel(chosenLocation)} holds <span className="figure">{chosenLocation.used}</span> of{' '}
                  <span className="figure">{chosenLocation.capacity}</span> slots.{' '}
                  {overCapacity
                    ? `${stockCount} units will not fit in the ${freeSlots} free slots — split the stock or pick another bin.`
                    : `${freeSlots} free, enough for the ${stockCount} being added.`}
                </span>
              </div>
            )}
          </SectionCard>
  )
}
