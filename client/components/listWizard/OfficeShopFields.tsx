import React, { useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { FieldValue, Fields, WizardForm } from '../../lib/listWizard/formState';
import { checked, text } from '../../lib/listWizard/formState';
import {
  CHARGE_FREQUENCIES, CHARGE_TYPES, DOCUMENT_ACCEPT, DOCUMENT_CARDS, EXISTING_DOCUMENT_LABELS, LAYOUT_OPTIONS, OFFICE_SHOP_AMENITY_GROUPS, PERMITTED_USES,
  blankCharge, documentCardLabel, listingDocumentsError, officeShopAmenitySummary, officeShopConditions, optionValue, selectOptions, selectValue, toggleLayout,
} from '../../lib/listWizard/officeShop';
import type { LayoutGroup, OfficeShopDocumentSlot, OfficeShopFiles, OfficeShopKind, Option } from '../../lib/listWizard/officeShop';

// The office and shop commercial form of the listing wizard (markup, ids,
// classes and data-os-* attributes unchanged from renderOfficeShopFields in
// legacy-pages/list.html). Each section renders its own
// `.office-shop-section.active` container (#office-shop-details-fields,
// -location-, -media-, -pricing-, -review-); render them only for the office
// and shop categories.
//
// Props shared by every section:
//   kind      'office' | 'shop' — switching keeps every value in the form;
//             controls of the other kind are hidden and collect as untouched.
//   form      the wizard form (lib/listWizard/formState.ts).
//   setField  writes fields[id] (checkbox → boolean, others → string).
//   update    merges a partial form (amenity selections, permitted uses, charges).
// OfficeShopMedia also takes:
//   files               the chosen, not yet uploaded documents.
//   onFiles(next)       called with every accepted change (and with the slot
//                       emptied when a choice is rejected); the upload is the page's.
//   uploadedNames       filenames already uploaded per slot (edit mode, after
//                       an upload, or a restored draft) for the card labels.
//   existingDocuments   edit mode: the listing's stored documents; renders the
//                       `.office-shop-existing-documents` links (omit otherwise).
//   onOpenAmenities(trigger)  the "Amenities Library" button was pressed.
//   onError(message)    a rejected document (type or size).
// Selecting #os-pricing-basis / #os-area-unit also writes the legacy
// fields['price-unit'], and #os-price-amount mirrors into fields['price-amount'],
// as list.html did.

export interface OfficeShopSectionProps {
  kind: OfficeShopKind;
  form: WizardForm;
  setField: (id: string, value: FieldValue) => void;
  update: (patch: Partial<WizardForm>) => void;
}

/** A row of GET /api/listings/:id/documents. */
export interface ExistingListingDocument { id?: string; documentType: string; filename?: string | null; downloadUrl?: string | null }

export interface OfficeShopMediaProps extends OfficeShopSectionProps {
  files: OfficeShopFiles;
  onFiles: (next: OfficeShopFiles) => void;
  uploadedNames?: Partial<Record<OfficeShopDocumentSlot, string[]>>;
  existingDocuments?: ExistingListingDocument[] | null;
  onOpenAmenities: (trigger: HTMLButtonElement) => void;
  onError: (message: string) => void;
}

type Change = ChangeEvent<HTMLInputElement | HTMLSelectElement>;

/** id / value / onChange for a text, number, date or time input. */
const bindText = (fields: Fields, setField: OfficeShopSectionProps['setField'], id: string) => ({
  id, value: text(fields, id), onChange: (event: Change) => setField(id, event.target.value),
});

/** id / checked / onChange for a checkbox with an id. */
const bindCheck = (fields: Fields, setField: OfficeShopSectionProps['setField'], id: string) => ({
  id, type: 'checkbox', checked: checked(fields, id), onChange: (event: ChangeEvent<HTMLInputElement>) => setField(id, event.target.checked),
});

const Options = ({ options }: { options: Option[] }) => <>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>;

function Select({ id, kind, fields, setField, required, onValue }: Pick<OfficeShopSectionProps, 'kind' | 'setField'> & { id: string; fields: Fields; required?: boolean; onValue?: (value: string) => void }) {
  return (
    <select id={id} required={required} value={selectValue(fields, id, kind)} onChange={(event) => { setField(id, event.target.value); if (onValue) onValue(event.target.value); }}>
      <Options options={selectOptions(id, kind)} />
    </select>
  );
}

// ---------------------------------------------------------------------------
// Step 1

export function OfficeShopDetails({ kind, form, setField }: OfficeShopSectionProps) {
  const fields = form.fields;
  return (
    <div className="office-shop-section active" id="office-shop-details-fields">
      <div className="field"><label htmlFor="os-subtype">Subtype</label><Select id="os-subtype" required kind={kind} fields={fields} setField={setField} /></div>
      <div className="field"><label htmlFor="os-role">Your role</label><Select id="os-role" required kind={kind} fields={fields} setField={setField} /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2

export function OfficeShopLocation({ form, setField }: OfficeShopSectionProps) {
  return (
    <div className="office-shop-section active" id="office-shop-location-fields">
      <div className="field"><label htmlFor="os-building">Building or Complex name <small>(optional)</small></label><input {...bindText(form.fields, setField, 'os-building')} maxLength={300} placeholder="eg BMW Towers" /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3

function OptionChecks({ group, options, category, isChecked, onToggle }: { group: string; options: Option[]; category?: string; isChecked: (key: string) => boolean; onToggle: (key: string, on: boolean) => void }) {
  return (
    <div className="option-grid">
      {options.map(([key, label]) => (
        <label key={key}><input type="checkbox" data-os-group={group} data-os-key={key} data-os-category={category} checked={isChecked(key)} onChange={(event) => onToggle(key, event.target.checked)} /> {label}</label>
      ))}
    </div>
  );
}

const DOCUMENT_ICON = <svg viewBox="0 0 32 40" aria-hidden="true"><path d="M5 1h14l9 9v27a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2zm13 2v8h8z" /></svg>;

function DocumentCard({ card, files, onFiles, uploadedNames, onError }: { card: (typeof DOCUMENT_CARDS)[number] } & Pick<OfficeShopMediaProps, 'files' | 'onFiles' | 'uploadedNames' | 'onError'>) {
  const input = useRef<HTMLInputElement>(null);
  const slotValue = files[card.slot];
  const selected: File[] = Array.isArray(slotValue) ? slotValue : slotValue ? [slotValue] : [];
  const empty = selected.length === 0;
  // A slot emptied by the page (uploaded, or restored without files) clears the input.
  useEffect(() => { if (empty && input.current) input.current.value = ''; }, [empty]);

  const withSlot = (chosen: File[]): OfficeShopFiles => ({ ...files, [card.slot]: card.multiple ? chosen : chosen[0] || null });
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files || []);
    const error = listingDocumentsError(chosen);
    if (error) {
      event.target.value = '';
      onFiles(withSlot([]));
      onError(error);
      return;
    }
    onFiles(withSlot(chosen));
  };
  const label = documentCardLabel(selected, (uploadedNames && uploadedNames[card.slot]) || [], card.label, card.multiple);
  return (
    <label className="office-shop-document-card" htmlFor={card.id}>
      {DOCUMENT_ICON}
      <span data-os-upload-name="" title={selected.length ? selected.map((file) => file.name).join(', ') : undefined}>{label}</span>
      <input ref={input} id={card.id} type="file" multiple={card.multiple || undefined} accept={DOCUMENT_ACCEPT} aria-label={card.aria} onChange={choose} />
    </label>
  );
}

export function OfficeShopMedia({ kind, form, setField, update, files, onFiles, uploadedNames, existingDocuments, onOpenAmenities, onError }: OfficeShopMediaProps) {
  const fields = form.fields;
  const isShop = kind === 'shop';
  const conditions = officeShopConditions(fields, kind);
  const selections = form.officeShopAmenitySelections;
  const summary = officeShopAmenitySummary(selections);
  const input = (id: string) => bindText(fields, setField, id);
  const check = (id: string) => bindCheck(fields, setField, id);
  const select = (id: string) => <Select id={id} kind={kind} fields={fields} setField={setField} />;
  const toggleUse = (key: string, on: boolean) => update({
    officeShopPermittedUses: PERMITTED_USES.map((option) => option[0]).filter((item) => (item === key ? on : form.officeShopPermittedUses.includes(item))),
  });

  return (
    <div className="office-shop-section active" id="office-shop-media-fields">
      <h2 className="section-heading">Office &amp; shop amenities</h2><p className="section-help">Choose what the space actually offers.</p>
      <button type="button" className="amenities-library-open" id="office-shop-amenities-open" onClick={(event) => onOpenAmenities(event.currentTarget)}>Amenities Library</button>
      <p className="amenities-library-summary" id="office-shop-amenities-summary" aria-live="polite" hidden={!summary}>{summary}</p>
      <div className="office-shop-amenities-store" aria-hidden="true">
        {OFFICE_SHOP_AMENITY_GROUPS.map((group) => (
          <React.Fragment key={group.title}>
            <h3 className="section-heading">{group.title}</h3>
            <OptionChecks group="os-amenities" options={group.choices} category={group.title} isChecked={(key) => selections[key] === true}
              onToggle={(key, on) => update({ officeShopAmenitySelections: { ...selections, [key]: on } })} />
          </React.Fragment>
        ))}
      </div>
      <div className="field"><label htmlFor="os-power-note">Power capacity or known limitations <small>(optional)</small></label><input {...input('os-power-note')} maxLength={300} /></div>
      <div className="field"><label htmlFor="os-internet-note">Known providers or speeds <small>(only if verified)</small></label><input {...input('os-internet-note')} maxLength={300} /></div>
      <div className="field"><label htmlFor="os-after-hours">Accessible hours</label>{select('os-after-hours')}</div>
      <div className="field" id="os-business-hours-fields" hidden={!conditions.businessHours}><label>Business hours <small>(required for business hours access)</small></label><div className="field-row"><div className="field"><label htmlFor="os-operating-hours-from">From</label><input {...input('os-operating-hours-from')} type="time" aria-label="Business hours start time" required={conditions.businessHours} /></div><div className="field"><label htmlFor="os-operating-hours-to">To</label><input {...input('os-operating-hours-to')} type="time" aria-label="Business hours end time" required={conditions.businessHours} /></div></div></div>
      <div className="field"><label htmlFor="os-accessibility-note">Accessibility note <small>(optional)</small></label><input {...input('os-accessibility-note')} maxLength={300} /></div>
      <h3 className="section-heading">Parking</h3><div className="field-row"><div className="field"><label htmlFor="os-parking-spaces">Number of spaces</label><input {...input('os-parking-spaces')} type="number" min="0" /></div><div className="field"><label htmlFor="os-parking-cost">Parking cost</label>{select('os-parking-cost')}</div><div className="field"><label htmlFor="os-parking-paid-amount">Paid parking amount <small>(if paid)</small></label><input {...input('os-parking-paid-amount')} type="number" min="0" /></div></div>
      <div className="option-grid"><label><input {...check('os-parking-allocated')} /> Allocated to this unit</label><label><input {...check('os-visitor-parking')} /> Visitor parking</label>{isShop && <label><input {...check('os-customer-parking')} /> Customer parking</label>}</div>
      <h3 className="section-heading">Documents and rules</h3>
      <div className="office-shop-document-grid" aria-label="Optional property documents">
        {DOCUMENT_CARDS.map((card) => <DocumentCard key={card.id} card={card} files={files} onFiles={onFiles} uploadedNames={uploadedNames} onError={onError} />)}
      </div>
      <label><input {...check('os-documents-on-request')} /> Can provide ownership or management documents on request</label>
      <h3 className="section-heading">Rules and policy</h3><div className="field"><label htmlFor="os-permitted-uses">Permitted business uses</label><div className="option-grid" id="os-permitted-uses">{PERMITTED_USES.map(([key, label]) => <label key={key}><input type="checkbox" data-os-use={key} checked={form.officeShopPermittedUses.includes(key)} onChange={(event) => toggleUse(key, event.target.checked)} /> {label}</label>)}</div></div>
      <div className="field-row"><div className="field"><label htmlFor="os-fitout-rule">Fit-out or renovation</label>{select('os-fitout-rule')}</div>{isShop && <div className="field"><label htmlFor="os-signage">Signage</label>{select('os-signage')}</div>}</div>
      <div className="field-row"><div className="field"><label htmlFor="os-subletting">Subletting or assignment</label>{select('os-subletting')}</div><div className="field"><label htmlFor="os-restoration">Restoration on exit</label>{select('os-restoration')}</div></div><div className="field"><label htmlFor="os-noise-limits">Operating hour or noise limits <small>(optional)</small></label><input {...input('os-noise-limits')} maxLength={300} /></div>
      {existingDocuments && (
        <div className="office-shop-existing-documents">
          {existingDocuments.filter((item) => EXISTING_DOCUMENT_LABELS[item.documentType]).map((item, index) => (
            <React.Fragment key={item.id || index}>
              {index > 0 && ' · '}
              <a href={item.downloadUrl || ''} target="_blank" rel="noopener">{`${EXISTING_DOCUMENT_LABELS[item.documentType]}: ${item.filename || 'Open document'}`}</a>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4

export function OfficeShopPricing({ kind, form, setField, update }: OfficeShopSectionProps) {
  const fields = form.fields;
  const isOffice = kind === 'office';
  const isShop = kind === 'shop';
  const conditions = officeShopConditions(fields, kind);
  const input = (id: string) => bindText(fields, setField, id);
  const select = (id: string, required?: boolean, onValue?: (value: string) => void) => <Select id={id} kind={kind} fields={fields} setField={setField} required={required} onValue={onValue} />;
  // list.html kept the legacy #price-unit / #price-amount in step with the commercial price.
  const syncPriceUnit = (id: string) => (value: string) => setField('price-unit', officeShopConditions({ ...fields, [id]: value }, kind).priceUnit);
  const layout = (group: LayoutGroup) => (
    <OptionChecks group={group} options={LAYOUT_OPTIONS[group]} isChecked={(key) => text(fields, group).split(',').includes(key)}
      onToggle={(key, on) => setField(group, toggleLayout(fields, group, key, on))} />
  );
  const charges = form.officeShopCharges;
  const setCharge = (index: number, key: 'type' | 'amount' | 'frequency', value: string) => update({
    officeShopCharges: charges.map((charge, position) => (position === index ? { ...charge, [key]: value } : charge)),
  });

  return (
    <div className="office-shop-section active" id="office-shop-pricing-fields">
      <details open><summary className="section-heading">Space</summary><div className="field-row"><div className="field"><label htmlFor="os-area">Area</label><input {...input('os-area')} type="number" min="0" step="0.01" required /></div><div className="field"><label htmlFor="os-area-unit">Area unit</label>{select('os-area-unit', true, syncPriceUnit('os-area-unit'))}</div></div><div className="field-row"><div className="field"><label htmlFor="os-area-measure">What the area measures</label>{select('os-area-measure', conditions.areaMeasureRequired)}</div><div className="field"><label htmlFor="os-fitout-status">Fit-out status</label>{select('os-fitout-status', true)}</div></div><div className="field-row"><div className="field"><label htmlFor="os-floor-level">Floor / level <small>(optional)</small></label><input {...input('os-floor-level')} /></div><div className="field"><label htmlFor="os-room-count">Number of rooms <small>(optional)</small></label><input {...input('os-room-count')} type="number" min="0" /></div><div className="field"><label htmlFor="os-ceiling-height">Ceiling height <small>(optional)</small></label><input {...input('os-ceiling-height')} /></div></div>
        <div id="os-office-space" className="conditional" hidden={!isOffice}><div className="field-row"><div className="field"><label htmlFor="os-capacity">Capacity</label><input {...input('os-capacity')} type="number" min="1" required={conditions.capacityRequired} /></div><div className="field"><label htmlFor="os-desks">Desks</label><input {...input('os-desks')} type="number" min="0" required={conditions.desksRequired} /></div></div><div className="field"><label>Layout <small>(optional)</small></label>{layout('os-office-layout')}</div><div className="field"><label htmlFor="os-private-rooms">Private offices and meeting rooms <small>(optional)</small></label><input {...input('os-private-rooms')} type="number" min="0" /></div><label><input {...bindCheck(fields, setField, 'os-furniture')} /> Furniture and partitions included</label></div>
        <div id="os-shop-space" className="conditional" hidden={!isShop}><div className="field-row"><div className="field"><label htmlFor="os-customer-area">Customer-facing floor area <small>(optional)</small></label><input {...input('os-customer-area')} type="number" min="0" /></div><div className="field"><label htmlFor="os-storage-area">Storage or mezzanine area <small>(optional)</small></label><input {...input('os-storage-area')} type="number" min="0" /></div></div><div className="field"><label>Layout <small>(optional)</small></label>{layout('os-shop-layout')}</div><div className="field-row"><div className="field"><label htmlFor="os-street-frontage">Street frontage</label>{select('os-street-frontage')}</div><div className="field"><label htmlFor="os-frontage-width">Frontage width <small>(optional)</small></label><input {...input('os-frontage-width')} /></div><div className="field"><label htmlFor="os-display-windows">Display windows</label>{select('os-display-windows')}</div></div><div className="field-row"><div className="field"><label htmlFor="os-loading-access">Delivery / loading access</label>{select('os-loading-access')}</div><div className="field"><label htmlFor="os-foot-traffic">Foot traffic <small>(optional)</small></label><input {...input('os-foot-traffic')} maxLength={300} /></div><div className="field"><label htmlFor="os-nearby-anchors">Nearby anchors <small>(optional)</small></label><input {...input('os-nearby-anchors')} maxLength={300} /></div></div></div></details>
      <details open><summary className="section-heading">Price and costs</summary><div className="field-row"><div className="field"><label htmlFor="os-pricing-basis">Pricing basis</label>{select('os-pricing-basis', true, syncPriceUnit('os-pricing-basis'))}</div><div className="field"><label htmlFor="os-price-amount">Amount (KSh)</label><input {...input('os-price-amount')} onChange={(event) => { setField('os-price-amount', event.target.value); setField('price-amount', event.target.value); }} type="number" min="0" step="1" required /></div></div><div id="os-yearly-extra" className="conditional field" hidden={!conditions.yearlyExtra}><label htmlFor="os-monthly-payment">Can rent be paid monthly?</label>{select('os-monthly-payment')}</div><div id="os-area-extra" className="conditional field" hidden={!conditions.areaExtra}><label htmlFor="os-area-period">Per-area period</label>{select('os-area-period')}</div><div id="os-desk-extra" className="conditional field" hidden={!conditions.deskExtra}><label htmlFor="os-desk-included">What the desk fee covers</label><input {...input('os-desk-included')} placeholder="Internet, utilities, meeting rooms, access hours" /></div><div id="os-short-extra" className="conditional field" hidden={!conditions.shortExtra}><label htmlFor="os-short-pricing-note">Operating hours, overtime, cancellation, tax or cleaning</label><input {...input('os-short-pricing-note')} maxLength={500} /></div><div id="os-turnover-extra" className="conditional field" hidden={!conditions.turnoverExtra}><label htmlFor="os-turnover-threshold">Percentage and sales threshold</label><input {...input('os-turnover-threshold')} /></div>
        <div className="field-row"><div className="field"><label htmlFor="os-service-charge">Service charge</label>{select('os-service-charge', true)}</div><div className="field"><label htmlFor="os-service-amount">Service amount <small>(if not included)</small></label><input {...input('os-service-amount')} type="number" min="0" /></div><div className="field"><label htmlFor="os-service-frequency">Service frequency <small>(if not included)</small></label>{select('os-service-frequency')}</div></div><div className="field-row"><div className="field"><label htmlFor="os-utilities">Utilities</label>{select('os-utilities', true)}</div><div className="field"><label htmlFor="os-utilities-amount">Fixed utilities amount <small>(if fixed)</small></label><input {...input('os-utilities-amount')} type="number" min="0" /></div><div className="field"><label htmlFor="os-tax">VAT / tax</label>{select('os-tax', true)}</div></div><div className="field-row"><div className="field"><label htmlFor="os-deposit">Security deposit</label><input {...input('os-deposit')} required placeholder="Amount, months, or Not confirmed" /></div><div className="field"><label htmlFor="os-advance-rent">Advance rent <small>(optional)</small></label><input {...input('os-advance-rent')} placeholder="Periods due or Not confirmed" /></div></div>
        <div className="field"><label>Other compulsory charges <small>(optional)</small></label><div id="os-charges-rows">
          {charges.map((charge, index) => (
            <div className="field-row" key={index}>
              <div className="field"><label>Type</label><select data-os-charge="type" value={optionValue(charge.type, CHARGE_TYPES)} onChange={(event) => setCharge(index, 'type', event.target.value)}><Options options={CHARGE_TYPES} /></select></div>
              <div className="field"><label>Amount (KSh)</label><input data-os-charge="amount" type="number" min="0" value={charge.amount} onChange={(event) => setCharge(index, 'amount', event.target.value)} /></div>
              <div className="field"><label>Frequency</label><select data-os-charge="frequency" value={optionValue(charge.frequency, CHARGE_FREQUENCIES)} onChange={(event) => setCharge(index, 'frequency', event.target.value)}><Options options={CHARGE_FREQUENCIES} /></select></div>
              <button type="button" className="step-btn back" data-os-remove-charge="" onClick={() => update({ officeShopCharges: charges.filter((_, position) => position !== index) })}>Remove</button>
            </div>
          ))}
        </div><button type="button" id="os-add-charge" onClick={() => update({ officeShopCharges: [...charges, blankCharge()] })}>Add charge</button></div><div className="field"><label htmlFor="os-rent-increases">Rent increases <small>(optional)</small></label>{select('os-rent-increases')}</div></details>
      <details open><summary className="section-heading">Lease and availability</summary><div className="field-row"><div className="field"><label htmlFor="os-available-from">Available from</label><input {...input('os-available-from')} type="date" required /></div><div className="field"><label htmlFor="os-min-term">{conditions.minTermLabel}</label><input {...input('os-min-term')} type="number" min="1" required placeholder={conditions.minTermPlaceholder} /></div><div className="field"><label htmlFor="os-payment-frequency">Payment frequency</label>{select('os-payment-frequency', true)}</div></div><div className="field-row"><div className="field"><label htmlFor="os-viewing-required">Viewing required before renting</label>{select('os-viewing-required', true)}</div><div className="field"><label htmlFor="os-preferred-term">Preferred lease term <small>(optional)</small></label><input {...input('os-preferred-term')} type="number" min="1" /></div><div className="field"><label htmlFor="os-renewal">Renewal options <small>(optional)</small></label>{select('os-renewal')}</div></div><div className="field-row"><div className="field"><label htmlFor="os-notice-period">Notice period <small>(optional)</small></label><input {...input('os-notice-period')} /></div><div className="field"><label htmlFor="os-lock-in">Lock-in or early-exit rules <small>(optional)</small></label><input {...input('os-lock-in')} maxLength={500} /></div></div><div className="field-row"><div className="field"><label htmlFor="os-viewing-availability">Viewing availability <small>(optional)</small></label><input {...input('os-viewing-availability')} maxLength={300} /></div><div className="field"><label htmlFor="os-payment-methods">Accepted payment methods <small>(optional)</small></label><input {...input('os-payment-methods')} maxLength={300} /></div></div></details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 (static markup; `summary` is the page's review line)

export function OfficeShopReview({ form, setField, summary }: Pick<OfficeShopSectionProps, 'form' | 'setField'> & { summary: string }) {
  return (
    <div className="office-shop-section active" id="office-shop-review-fields">
      <h3 className="section-heading">Commercial listing summary</h3>
      <p className="section-help" id="office-shop-review-summary">{summary}</p>
      <label><input {...bindCheck(form.fields, setField, 'os-accuracy-confirmed')} /> Availability and pricing are accurate today</label>
      <p className="section-help">VaRoom records the confirmation date when you publish.</p>
    </div>
  );
}
