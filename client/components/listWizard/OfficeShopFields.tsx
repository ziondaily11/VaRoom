import React, { useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { FieldValue, Fields, WizardForm } from '../../lib/listWizard/formState';
import { checked, text } from '../../lib/listWizard/formState';
import {
  DOCUMENT_ACCEPT, DOCUMENT_CARDS, EXISTING_DOCUMENT_LABELS, OFFICE_SHOP_AMENITY_GROUPS,
  documentCardLabel, listingDocumentsError, officeShopAmenitySummary, officeShopConditions, selectOptions, selectValue,
} from '../../lib/listWizard/officeShop';
import type { OfficeShopDocumentSlot, OfficeShopFiles, OfficeShopKind, Option } from '../../lib/listWizard/officeShop';

// The office and shop form of the listing wizard: only what a renter needs to
// decide (about 25 questions). Each section renders its own
// `.office-shop-section.active` container: details (step 1), location (2),
// space (3), documents (4), pricing (5), review (6). Answers saved before the
// form was shortened stay in the form (hydrateOfficeShopDetails) and are saved
// again unchanged, so editing an older listing loses nothing.
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

/** Step 3, "The space": size and fit-out, capacity (office) or frontage (shop), amenities, opening hours, parking. */
export function OfficeShopSpace({ kind, form, setField, update, onOpenAmenities }: OfficeShopSectionProps & Pick<OfficeShopMediaProps, 'onOpenAmenities'>) {
  const fields = form.fields;
  const isOffice = kind === 'office';
  const conditions = officeShopConditions(fields, kind);
  const selections = form.officeShopAmenitySelections;
  const summary = officeShopAmenitySummary(selections);
  const input = (id: string) => bindText(fields, setField, id);
  const select = (id: string, required?: boolean, onValue?: (value: string) => void) => <Select id={id} kind={kind} fields={fields} setField={setField} required={required} onValue={onValue} />;
  // The listing's price unit follows the area unit (per-area pricing).
  const syncPriceUnit = (id: string) => (value: string) => setField('price-unit', officeShopConditions({ ...fields, [id]: value }, kind).priceUnit);

  return (
    <div className="office-shop-section active" id="office-shop-space-fields">
      <h2 className="section-heading">Size and fit-out</h2>
      <div className="field-row">
        <div className="field"><label htmlFor="os-area">Area</label><input {...input('os-area')} type="number" min="0" step="0.01" required /></div>
        <div className="field"><label htmlFor="os-area-unit">Area unit</label>{select('os-area-unit', true, syncPriceUnit('os-area-unit'))}</div>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor="os-fitout-status">Fit-out status</label>{select('os-fitout-status', true)}</div>
        <div className="field"><label htmlFor="os-floor-level">Floor or level <small>(optional)</small></label><input {...input('os-floor-level')} placeholder="e.g. 3rd floor" /></div>
      </div>
      {isOffice ? (
        <div className="field-row" id="os-office-space">
          <div className="field"><label htmlFor="os-capacity">People it fits</label><input {...input('os-capacity')} type="number" min="1" required={conditions.capacityRequired} /></div>
          <div className="field"><label htmlFor="os-desks">Desks {conditions.desksRequired ? null : <small>(optional)</small>}</label><input {...input('os-desks')} type="number" min="0" required={conditions.desksRequired} /></div>
        </div>
      ) : (
        <div className="field" id="os-shop-space"><label htmlFor="os-street-frontage">Street frontage</label>{select('os-street-frontage')}</div>
      )}

      <h2 className="section-heading">Amenities</h2>
      <p className="section-help">Choose what the space actually offers.</p>
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

      <h2 className="section-heading">Opening hours</h2>
      <div className="field"><label htmlFor="os-after-hours">When renters can get in</label>{select('os-after-hours')}</div>
      <div className="field-row" id="os-business-hours-fields" hidden={!conditions.businessHours}>
        <div className="field"><label htmlFor="os-operating-hours-from">From</label><input {...input('os-operating-hours-from')} type="time" required={conditions.businessHours} /></div>
        <div className="field"><label htmlFor="os-operating-hours-to">To</label><input {...input('os-operating-hours-to')} type="time" required={conditions.businessHours} /></div>
      </div>

      <h2 className="section-heading">Parking</h2>
      <div className="field-row">
        <div className="field"><label htmlFor="os-parking-spaces">Spaces <small>(optional)</small></label><input {...input('os-parking-spaces')} type="number" min="0" /></div>
        <div className="field"><label htmlFor="os-parking-cost">Parking cost</label>{select('os-parking-cost')}</div>
      </div>
      <div className="field" hidden={!conditions.parkingAmountRequired}><label htmlFor="os-parking-paid-amount">Parking fee (KSh)</label><input {...input('os-parking-paid-amount')} type="number" min="0" required={conditions.parkingAmountRequired} /></div>
    </div>
  );
}

/** Step 4, beside the photos: the optional floor plan and policy (edit mode lists the stored documents). */
export function OfficeShopDocuments({ files, onFiles, uploadedNames, existingDocuments, onError }: Pick<OfficeShopMediaProps, 'files' | 'onFiles' | 'uploadedNames' | 'existingDocuments' | 'onError'>) {
  return (
    <div className="office-shop-section active" id="office-shop-media-fields">
      <h2 className="section-heading">Documents</h2>
      <p className="section-help">Optional. Renters see them on the listing.</p>
      <div className="office-shop-document-grid" aria-label="Optional property documents">
        {DOCUMENT_CARDS.filter((card) => card.slot !== 'documents').map((card) => <DocumentCard key={card.id} card={card} files={files} onFiles={onFiles} uploadedNames={uploadedNames} onError={onError} />)}
      </div>
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
// Step 5

/** Step 5, "Price & terms": the price, the costs on top of it, and the lease. */
export function OfficeShopPricing({ kind, form, setField }: OfficeShopSectionProps) {
  const fields = form.fields;
  const conditions = officeShopConditions(fields, kind);
  const input = (id: string) => bindText(fields, setField, id);
  const select = (id: string, required?: boolean, onValue?: (value: string) => void) => <Select id={id} kind={kind} fields={fields} setField={setField} required={required} onValue={onValue} />;
  // list.html kept the legacy #price-unit / #price-amount in step with the commercial price.
  const syncPriceUnit = (id: string) => (value: string) => setField('price-unit', officeShopConditions({ ...fields, [id]: value }, kind).priceUnit);

  return (
    <div className="office-shop-section active" id="office-shop-pricing-fields">
      <h2 className="section-heading">Price</h2>
      <div className="field-row">
        <div className="field"><label htmlFor="os-pricing-basis">Priced</label>{select('os-pricing-basis', true, syncPriceUnit('os-pricing-basis'))}</div>
        <div className="field"><label htmlFor="os-price-amount">Amount (KSh)</label><input {...input('os-price-amount')} onChange={(event) => { setField('os-price-amount', event.target.value); setField('price-amount', event.target.value); }} type="number" min="0" step="1" required /></div>
      </div>
      <div id="os-area-extra" className="conditional field-row" hidden={!conditions.areaExtra}>
        <div className="field"><label htmlFor="os-area-period">Per-area period</label>{select('os-area-period')}</div>
        <div className="field"><label htmlFor="os-area-measure">What the area measures</label>{select('os-area-measure', conditions.areaMeasureRequired)}</div>
      </div>
      <div id="os-yearly-extra" className="conditional field" hidden={!conditions.yearlyExtra}><label htmlFor="os-monthly-payment">Can rent be paid monthly?</label>{select('os-monthly-payment')}</div>
      <div id="os-turnover-extra" className="conditional field" hidden={!conditions.turnoverExtra}><label htmlFor="os-turnover-threshold">Percentage and sales threshold</label><input {...input('os-turnover-threshold')} /></div>

      <h2 className="section-heading">Costs on top of the price</h2>
      <div className="field-row">
        <div className="field"><label htmlFor="os-service-charge">Service charge</label>{select('os-service-charge', true)}</div>
        <div className="field"><label htmlFor="os-utilities">Utilities</label>{select('os-utilities', true)}</div>
      </div>
      <div className="field-row" hidden={!conditions.serviceAmountRequired}>
        <div className="field"><label htmlFor="os-service-amount">Service charge amount (KSh)</label><input {...input('os-service-amount')} type="number" min="0" required={conditions.serviceAmountRequired} /></div>
        <div className="field"><label htmlFor="os-service-frequency">Paid</label>{select('os-service-frequency', conditions.serviceAmountRequired)}</div>
      </div>
      <div className="field" hidden={!conditions.utilitiesAmountRequired}><label htmlFor="os-utilities-amount">Fixed utilities amount (KSh)</label><input {...input('os-utilities-amount')} type="number" min="0" required={conditions.utilitiesAmountRequired} /></div>
      <div className="field-row">
        <div className="field"><label htmlFor="os-tax">VAT or tax</label>{select('os-tax', true)}</div>
        <div className="field"><label htmlFor="os-deposit">Security deposit</label><input {...input('os-deposit')} required placeholder="e.g. 2 months, or KSh 100,000" /></div>
      </div>

      <h2 className="section-heading">Lease</h2>
      <div className="field-row">
        <div className="field"><label htmlFor="os-available-from">Available from</label><input {...input('os-available-from')} type="date" required /></div>
        <div className="field"><label htmlFor="os-min-term">{conditions.minTermLabel}</label><input {...input('os-min-term')} type="number" min="1" required placeholder={conditions.minTermPlaceholder} /></div>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor="os-payment-frequency">Rent paid</label>{select('os-payment-frequency', true)}</div>
        <div className="field"><label htmlFor="os-viewing-required">Viewing needed before renting</label>{select('os-viewing-required', true)}</div>
      </div>
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
      <p className="section-help">Renters rely on this. Update the listing when anything changes.</p>
    </div>
  );
}
