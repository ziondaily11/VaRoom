import React from 'react';
import type { Category, FieldBinding, FieldValue, HotelMode, PropertyPurpose, SaleMode } from '../../lib/listWizard/formState';
import { SHORT_STAY, checked, isOfficeShop, text } from '../../lib/listWizard/formState';
import type { WizardCopy } from '../../lib/listWizard/copy';
import { priceUnitOptions } from '../../lib/listWizard/copy';
import { ADVANCE_OPTIONS, NOTICE_OPTIONS } from '../../lib/settings/bookingDefaults';

// The listing wizard's own fields for steps 1, 2 and 4 (ids, names,
// classes and wording unchanged from legacy-pages/list.html). The office/shop
// commercial sections are in OfficeShopFields.tsx.

type Change = React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

/** id / value / onChange for a text-like control kept in `fields`. */
export const bind = ({ fields, setField }: FieldBinding, id: string, onEdit?: (event: Change) => void) => ({
  id,
  value: text(fields, id),
  onChange: (event: Change) => { onEdit?.(event); setField(id, event.target.value); },
});

export const bindCheckbox = ({ fields, setField }: FieldBinding, id: string) => ({
  id, type: 'checkbox', checked: checked(fields, id),
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => setField(id, event.target.checked as FieldValue),
});

function ChoiceButtons<T extends string>({ className, optionClass, attribute, options, value, onChoose, hidden, label, pressedOnlyWhenChosen }: {
  className: string; optionClass?: string; attribute: string; options: Array<[T, string, string?]>; value: T | null;
  onChoose: (value: T) => void; hidden?: boolean; label: string; pressedOnlyWhenChosen?: boolean;
}) {
  return (
    <div className={className} hidden={hidden} aria-label={label}>
      {options.map(([option, title, small]) => {
        const selected = option === value;
        const pressed = pressedOnlyWhenChosen && value === null ? undefined : (selected ? 'true' : 'false');
        return (
          <button type="button" key={option} className={[optionClass, selected && 'selected'].filter(Boolean).join(' ') || undefined}
            {...{ [attribute]: option }} aria-pressed={pressed} onClick={() => onChoose(option)}>
            {small ? <><strong>{title}</strong><small>{small}</small></> : title}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Step 1 ----------

export function OfficeShopTypeChoice({ category, onChoose }: { category: Category; onChoose: (kind: 'office' | 'shop') => void }) {
  const active = isOfficeShop(category);
  return (
    <div className={`office-shop-type${active ? ' active' : ''}`} id="office-shop-type" aria-label="Listing type">
      {([['office', 'Office', 'Offices, desks, meeting rooms and serviced workspaces'], ['shop', 'Shop', 'Retail units, showrooms, studios and street-front shops']] as const).map(([kind, title, small]) => (
        <button type="button" key={kind} data-office-shop-type={kind} className={active && category === kind ? 'selected' : undefined}
          aria-pressed={active ? (category === kind ? 'true' : 'false') : undefined} onClick={() => onChoose(kind)}>
          <strong>{title}</strong><small>{small}</small>
        </button>
      ))}
    </div>
  );
}

export function HotelModeChoice({ category, mode, onChoose }: { category: Category; mode: HotelMode | null; onChoose: (mode: HotelMode) => void }) {
  return (
    <ChoiceButtons<HotelMode>
      className="hotel-offer-mode" optionClass="hotel-offer-option" attribute="data-hotel-mode" label="What would you like to offer?"
      hidden={category !== 'hotel'} value={mode} onChoose={onChoose} pressedOnlyWhenChosen
      options={[['table', 'Table Reservations', 'Dining reservations only'], ['stay', 'Hotel Stay', 'Accommodation only'], ['both', 'Both', 'Stays and dining reservations']]}
    />
  );
}

export function PropertyPurposeChoice({ category, purpose, onChoose }: { category: Category; purpose: PropertyPurpose; onChoose: (purpose: PropertyPurpose) => void }) {
  return (
    <ChoiceButtons<PropertyPurpose>
      className="property-purpose-mode" optionClass="property-purpose-option" attribute="data-property-purpose" label="What is this property listed for?"
      hidden={category !== 'property'} value={purpose} onChoose={onChoose}
      options={[['rent', 'Rental', 'Monthly rental listing'], ['sale', 'For sale', 'Property sale listing'], ['both', 'Both', 'Selling and renting are both options']]}
    />
  );
}

export function IntroFields({ binding, copy, tableOnly }: { binding: FieldBinding; copy: WizardCopy; tableOnly: boolean }) {
  return (
    <div className="step-fields">
      <div className="field">
        <label htmlFor="title" id="title-label">{copy.titleLabel}</label>
        <input type="text" {...bind(binding, 'title')} name="title" required placeholder={copy.titlePlaceholder} />
      </div>
      <div className="field">
        <label htmlFor="caption" id="caption-label">{copy.captionLabel}</label>
        <textarea {...bind(binding, 'caption')} name="caption" required maxLength={500} placeholder={copy.captionPlaceholder} />
      </div>
      <div className="field" id="property-description-field" style={{ display: tableOnly ? 'none' : undefined }}>
        <label htmlFor="property-description" id="description-label">{copy.descriptionLabel}</label>
        <textarea {...bind(binding, 'property-description')} name="property_description" required={!tableOnly} placeholder={copy.descriptionPlaceholder} />
      </div>
    </div>
  );
}

// ---------- Step 4 ----------

const BEDROOM_TYPES = ['Bedsitter', 'Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', '4 bedrooms', '5 bedrooms'];

export function BookingFields({ binding, copy, category, hotelMode, purpose, saleMode, priceUnit, onSaleMode, calendar, onPriceEdit }: {
  binding: FieldBinding;
  copy: WizardCopy;
  category: Category;
  hotelMode: HotelMode | null;
  purpose: PropertyPurpose;
  saleMode: SaleMode;
  priceUnit: string;
  onSaleMode: (mode: SaleMode) => void;
  /** The availability calendar (short stays). */
  calendar: React.ReactNode;
  /** Clears a "greater than 0" message as the host types. */
  onPriceEdit: (event: Change) => void;
}) {
  const officeShop = isOfficeShop(category);
  const property = category === 'property';
  const tableOnly = category === 'hotel' && hotelMode === 'table';
  const tableEnabled = category === 'hotel' && (hotelMode === 'table' || hotelMode === 'both');
  const sale = property && purpose === 'sale';
  const shortStayActive = SHORT_STAY.includes(category) && !tableOnly && !(category === 'hotel' && !hotelMode);
  const longTermActive = property;
  const hide = (hidden: boolean): React.CSSProperties | undefined => (hidden ? { display: 'none' } : undefined);
  const units = officeShop ? [{ value: priceUnit, label: '' }] : priceUnitOptions(category);
  const bedroom = text(binding.fields, 'property-bedroom-type');

  return (
    <>
      <div className="field field-row" id="stay-price-field" style={hide(officeShop || tableOnly || sale)}>
        <div className="field">
          <label htmlFor="price-amount">Price (KES)</label>
          <input type="number" {...bind(binding, 'price-amount', onPriceEdit)} name="price-amount" min="0" step="1" placeholder="e.g. 3500" required={property && !sale} />
        </div>
        <div className="field">
          <label htmlFor="price-unit">&nbsp;</label>
          <select id="price-unit" name="price-unit" value={priceUnit} onChange={(event) => binding.setField('price-unit', event.target.value)}>
            {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
          </select>
        </div>
      </div>

      <div className="field" id="stay-room-type-field" style={hide(officeShop || property || tableOnly)}>
        <label htmlFor="size-or-type" id="size-label">{copy.sizeLabel}</label>
        <input type="text" {...bind(binding, 'size-or-type')} name="size-or-type" placeholder={copy.sizePlaceholder} />
      </div>
      <div className="field-row property-bed-bath-fields" id="property-bed-bath-fields" style={{ display: property ? 'grid' : 'none' }}>
        <div className="field">
          <label htmlFor="property-bedroom-type">Type</label>
          <select {...bind(binding, 'property-bedroom-type')} name="property-bedroom-type">
            <option value="">Choose type</option>
            {BEDROOM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            {/* Older listings may hold a type that is no longer offered. */}
            {bedroom && !BEDROOM_TYPES.includes(bedroom) && <option value={bedroom} data-legacy-value="true">{bedroom}</option>}
          </select>
        </div>
        <div className="field">
          <label htmlFor="property-bathrooms">Bathrooms</label>
          <input type="number" {...bind(binding, 'property-bathrooms')} name="property-bathrooms" min="1" step="1" inputMode="numeric" placeholder="e.g. 1" />
        </div>
      </div>

      <div className={`booking-group${shortStayActive ? ' active' : ''}`} id="short-stay-fields">
        <div className="field-row">
          <div className="field">
            <label htmlFor="max-guests" id="max-guests-label">{copy.maxGuestsLabel}</label>
            <input type="number" {...bind(binding, 'max-guests')} min="1" placeholder={copy.maxGuestsPlaceholder} />
          </div>
          <div className="field">
            <label htmlFor="min-stay" id="min-stay-label">{copy.minStayLabel}</label>
            <input type="number" {...bind(binding, 'min-stay')} min="1" placeholder={copy.minStayPlaceholder} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="checkin-time">Check-in time</label>
            <input type="time" {...bind(binding, 'checkin-time')} />
          </div>
          <div className="field">
            <label htmlFor="checkout-time">Check-out time</label>
            <input type="time" {...bind(binding, 'checkout-time')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cleaning-fee" id="cleaning-fee-label">{copy.cleaningFeeLabel}</label>
          <input type="number" {...bind(binding, 'cleaning-fee')} min="0" placeholder="Leave blank if none" />
        </div>
        <div className="field">
          <label htmlFor="cancellation-policy">Cancellation policy</label>
          <select id="cancellation-policy" value={text(binding.fields, 'cancellation-policy') || 'moderate'} onChange={(event) => binding.setField('cancellation-policy', event.target.value)}>
            <option value="flexible">Flexible</option>
            <option value="moderate">Moderate</option>
            <option value="strict">Strict</option>
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="max-stay">Maximum stay (nights)</label>
            <input type="number" {...bind(binding, 'max-stay')} min="1" placeholder="No maximum" />
          </div>
          <div className="field">
            <label htmlFor="min-notice">Minimum notice</label>
            <select {...bind(binding, 'min-notice')}>
              {NOTICE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="max-advance">How far ahead guests can book</label>
          <select {...bind(binding, 'max-advance')}>
            {ADVANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="checkbox-row">
          <input {...bindCheckbox(binding, 'instant-book')} />
          <label htmlFor="instant-book">Instant book: confirm guests for open nights without waiting for my approval</label>
        </div>
        {calendar}
      </div>

      <div className={`booking-group${longTermActive ? ' active' : ''}`} id="long-term-fields">
        <div className="field">
          <label htmlFor="available-from">Available from</label>
          <input type="date" {...bind(binding, 'available-from')} />
        </div>
        <div className="field-row">
          <div className="field" style={hide(sale)}>
            <label htmlFor="min-lease">Min. lease (months)</label>
            <input type="number" {...bind(binding, 'min-lease')} min="1" placeholder="e.g. 6" />
          </div>
          <div className="field" style={hide(sale)}>
            <label htmlFor="deposit-amount">Deposit (KES, optional)</label>
            <input type="number" {...bind(binding, 'deposit-amount')} min="0" placeholder="Leave blank if none" />
          </div>
        </div>
        <div className="checkbox-row" style={hide(sale)}>
          <input {...bindCheckbox(binding, 'utilities-included')} />
          <label htmlFor="utilities-included">Utilities included in price</label>
        </div>
      </div>
      <div className={`hotel-dining-fields${tableEnabled ? ' active' : ''}`} id="hotel-dining-fields">
        <div className="field" id="dining-name-field" style={hide(!(category === 'hotel' && hotelMode === 'both'))}>
          <label htmlFor="dining-restaurant-name">Restaurant / dining name</label>
          <input type="text" {...bind(binding, 'dining-restaurant-name')} maxLength={300} placeholder="e.g. The Garden Restaurant" required={category === 'hotel' && hotelMode === 'both'} />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="dining-opening-hours">Opening hours</label>
            <input type="text" {...bind(binding, 'dining-opening-hours')} maxLength={100} placeholder="e.g. 9:00 AM – 8:00 PM" required={tableEnabled} />
          </div>
          <div className="field">
            <label htmlFor="dining-tables-available">Tables available</label>
            <input type="number" {...bind(binding, 'dining-tables-available')} min="1" max="1000" placeholder="e.g. 12" required={tableEnabled} />
          </div>
        </div>
      </div>

      <div className="field" id="property-units-field" hidden={!property}>
        <label htmlFor="property-units-available">Units available</label>
        <input type="number" {...bind(binding, 'property-units-available')} min="1" placeholder="e.g. 8" />
      </div>

      <div className="property-sale-section" id="property-sale-section" hidden={!(property && purpose !== 'rent')}>
        <span className="property-section-label">Sale price</span>
        <div className="sale-price-mode-row">
          {(['exact', 'starting'] as SaleMode[]).map((mode) => (
            <button type="button" key={mode} className={`sale-mode-option${saleMode === mode ? ' selected' : ''}`} data-sale-mode={mode} aria-pressed={saleMode === mode ? 'true' : 'false'} onClick={() => onSaleMode(mode)}>
              {mode === 'exact' ? 'Exact price' : 'Starting from'}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="property-sale-price">Sale price (KES)</label>
          <input type="number" {...bind(binding, 'property-sale-price', onPriceEdit)} min="0" step="1" placeholder="e.g. 12500000" required={property && purpose !== 'rent'} />
        </div>
      </div>
    </>
  );
}
