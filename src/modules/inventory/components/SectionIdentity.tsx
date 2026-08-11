import Icon from '../../../components/ui/Icon'
import { Field, SectionCard, inputStyle, fieldRow } from './EquipmentShared'
import { useEquipmentContext } from './AddEquipmentContext'
import { EQUIPMENT_CATEGORIES } from '../../../data/addEquipment'

export function SectionIdentity() {
  const {
    assetCode,
    name,
    setName,
    shortName,
    setShortName,
    category,
    setCategory,
    brand,
    setBrand,
    modelNo,
    setModelNo,
    manufacturerDiffers,
    setManufacturerDiffers,
    manufacturer,
    setManufacturer,
    description,
    setDescription,
    thumbnail,
    gallery,
    setGallery,
    imageError,
    thumbInput,
    galleryInput,
    addImages,
    errors,
    sectionNumber,
  } = useEquipmentContext()

  return (
    <SectionCard id="sec-identity" n={sectionNumber('sec-identity')} title="Identity">
            <div style={fieldRow}>
              <Field label="Equipment Name" required error={errors.name} span={2}>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                  }}
                  placeholder="e.g. Sony FX3 Camera Body"
                  style={inputStyle(Boolean(errors.name))}
                />
              </Field>
              <Field label="Short Name" hint="Used on labels and packing lists.">
                <input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="e.g. FX3 Body"
                  style={inputStyle()}
                />
              </Field>
            </div>

            <div style={fieldRow}>
              <Field label="Asset Code" hint="Auto, read-only. This is also the SKU — §4.">
                <input value={assetCode} readOnly className="identifier" style={{ ...inputStyle(), background: 'var(--card)', color: 'var(--nav-active-accent)' }} />
              </Field>
              <Field label="Category" required error={errors.category}>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value)
                  }}
                  style={inputStyle(Boolean(errors.category))}
                >
                  <option value="">Select a category</option>
                  {EQUIPMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Brand" required error={errors.brand}>
                <input
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value)
                  }}
                  placeholder="e.g. Sony"
                  style={inputStyle(Boolean(errors.brand))}
                />
              </Field>
              <Field label="Model">
                <input value={modelNo} onChange={(e) => setModelNo(e.target.value)} placeholder="e.g. ILME-FX3" style={inputStyle()} />
              </Field>
            </div>

            {/* §3 — Manufacturer appears only when it differs from Brand. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={manufacturerDiffers}
                  onChange={(e) => {
                    setManufacturerDiffers(e.target.checked)
                    if (!e.target.checked) {
                      setManufacturer('')
                    }
                  }}
                  style={{ width: 15, height: 15, accentColor: 'var(--nav-active-accent)' }}
                />
                Manufacturer differs from Brand
                <span style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                  — a Zeiss lens made by Cosina, a rebadged light. Rare, so the field is hidden until it is true.
                </span>
              </label>
              {manufacturerDiffers && (
                <div style={fieldRow}>
                  <Field label="Manufacturer" required error={errors.manufacturer}>
                    <input
                      value={manufacturer}
                      onChange={(e) => {
                        setManufacturer(e.target.value)
                      }}
                      placeholder="e.g. Cosina"
                      style={inputStyle(Boolean(errors.manufacturer))}
                    />
                  </Field>
                </div>
              )}
            </div>

            <Field label="Description">
              <textarea
                value={description}
                maxLength={1000}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Full-frame Cinema Line camera, S-Cinetone, 4K 120p, 10-bit 4:2:2 internal…"
                style={{ ...inputStyle(), height: 'auto', padding: 10, resize: 'vertical' }}
              />
            </Field>
            <div style={{ marginTop: -8, display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              <span>Plain text. No rich-text engine exists, so no formatting toolbar is drawn.</span>
              <span className="figure">{description.length} / 1000</span>
            </div>

            {/* Thumbnail + gallery — §3. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>Thumbnail</span>
                <button
                  type="button"
                  onClick={() => thumbInput.current?.click()}
                  style={{
                    width: 132,
                    height: 100,
                    borderRadius: 'var(--r-sm)',
                    border: `1.5px dashed ${thumbnail ? 'var(--border)' : 'var(--border2)'}`,
                    background: 'var(--card2)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    padding: 0,
                  }}
                >
                  {thumbnail ? (
                    <img src={thumbnail.url} alt={thumbnail.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                      <Icon name="photo" size={20} />
                      Add thumbnail
                    </span>
                  )}
                </button>
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>JPG, PNG or WebP · 5 MB</span>
                <input
                  ref={thumbInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    addImages(e.target.files, 'thumb')
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>Images</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
                  {gallery.map((g) => (
                    <span key={g.id} style={{ position: 'relative', width: 74, height: 60, borderRadius: 'var(--r-xs)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={g.url} alt={g.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(g.url)
                          setGallery((prev) => prev.filter((x) => x.id !== g.id))
                        }}
                        aria-label={`Remove ${g.file.name}`}
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: 'none',
                          background: 'var(--card)',
                          color: 'var(--text)',
                          cursor: 'pointer',
                          display: 'grid',
                          placeItems: 'center',
                          padding: 0,
                        }}
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => galleryInput.current?.click()}
                    style={{
                      width: 74,
                      height: 60,
                      borderRadius: 'var(--r-xs)',
                      border: '1.5px dashed var(--border2)',
                      background: 'transparent',
                      color: 'var(--link)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      fontSize: 'var(--t-th)',
                      fontFamily: 'inherit',
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="plus" size={14} />
                    Add More
                  </button>
                </div>
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>50 MB per file (Evidence v1.1).</span>
                <input
                  ref={galleryInput}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    addImages(e.target.files, 'gallery')
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            {imageError && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                <Icon name="error" size={12} />
                {imageError}
              </span>
            )}
          </SectionCard>
  )
}
