import { Field, SectionCard, inputStyle, fieldRow, BsAbove } from './EquipmentShared'
import { useEquipmentContext } from './AddEquipmentContext'
import { Unavailable } from '../../../components/ui/Unavailable'
import { DEPRECIATION_UNAVAILABLE_REASON } from '../../../data/addEquipment'
import { formatMoney, parseMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'

export function SectionPurchase() {
  const {
    purchaseIso,
    setPurchaseIso,
    supplier,
    setSupplier,
    assetOwner,
    setAssetOwner,
    purchasePrice,
    setPurchasePrice,
    replacementValue,
    setReplacementValue,
    replacementPaisa,
    warrantyMonths,
    setWarrantyMonths,
    insurancePolicy,
    setInsurancePolicy,
    insuranceExpiryIso,
    setInsuranceExpiryIso,
    errors,
    sectionNumber,
  } = useEquipmentContext()

  return (
    <SectionCard
              id="sec-purchase"
              n={sectionNumber('sec-purchase')}
              title="Purchase"
              note="Replacement value is what damage charges and insurance claims are computed from."
            >
              <div style={fieldRow}>
                <Field label="Purchase date">
                  <BsAbove iso={purchaseIso} />
                  <input type="date" value={purchaseIso} onChange={(e) => setPurchaseIso(e.target.value)} style={inputStyle()} />
                </Field>
                <Field label="Supplier">
                  <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Camera Zone Nepal" style={inputStyle()} />
                </Field>
                <Field label="Asset owner">
                  <input value={assetOwner} onChange={(e) => setAssetOwner(e.target.value)} style={inputStyle()} />
                </Field>
              </div>

              <div style={fieldRow}>
                <Field
                  label="Purchase price (NPR)"
                  error={errors.purchasePrice}
                  hint={parseMoney(purchasePrice) ? formatMoney(parseMoney(purchasePrice) as Paisa) : undefined}
                >
                  <input
                    value={purchasePrice}
                    onChange={(e) => {
                      setPurchasePrice(e.target.value)
                    }}
                    placeholder="e.g. 4,65,000"
                    className="figure"
                    style={inputStyle(Boolean(errors.purchasePrice))}
                  />
                </Field>
                <Field
                  label="Replacement value (NPR)"
                  error={errors.replacementValue}
                  hint={replacementPaisa ? formatMoney(replacementPaisa) : 'Needed before the item can be rented.'}
                >
                  <input
                    value={replacementValue}
                    onChange={(e) => {
                      setReplacementValue(e.target.value)
                    }}
                    placeholder="e.g. 4,65,000"
                    className="figure"
                    style={inputStyle(Boolean(errors.replacementValue))}
                  />
                </Field>
                <Field label="Warranty (months)">
                  <input
                    type="number"
                    min={0}
                    value={warrantyMonths}
                    onChange={(e) => setWarrantyMonths(e.target.value)}
                    placeholder="e.g. 24"
                    className="figure"
                    style={inputStyle()}
                  />
                </Field>
              </div>

              <div style={fieldRow}>
                <Field label="Insurance policy">
                  <input value={insurancePolicy} onChange={(e) => setInsurancePolicy(e.target.value)} placeholder="Policy number" style={inputStyle()} />
                </Field>
                <Field label="Insurance expiry">
                  <BsAbove iso={insuranceExpiryIso} />
                  <input type="date" value={insuranceExpiryIso} onChange={(e) => setInsuranceExpiryIso(e.target.value)} style={inputStyle()} />
                </Field>
                <Field label="Depreciation group">
                  <Unavailable reason={DEPRECIATION_UNAVAILABLE_REASON} style={{ width: '100%' }}>
                    <select disabled style={{ ...inputStyle(), opacity: 0.55, width: '100%' }}>
                      <option>Not defined yet — §16</option>
                    </select>
                  </Unavailable>
                </Field>
              </div>
            </SectionCard>
  )
}
