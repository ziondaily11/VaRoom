'use strict';

// The listing wizard page (pages/list.tsx) and its dialogs. The components
// are rendered; what lives only in the page's event handlers (the order of
// the publish and pay flows) keeps a minimal source check, since those
// handlers close over React state. Their logic is tested in
// list-wizard-flows.test.js (saveForCheckout, prepareListingCheckout,
// reviewActions, uploadPendingMedia).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('./helpers/loadTs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.join(__dirname, '..');

/** Loads a .tsx component (and its relative .ts/.tsx imports) for server rendering. */
function loadTsx(entry) {
  const cache = new Map();
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = (specifier) => {
      if (!specifier.startsWith('.')) return require(specifier);
      const resolved = path.resolve(path.dirname(file), specifier);
      const found = ['.ts', '.tsx', ''].map((extension) => resolved + extension).find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      return load(found);
    };
    new Function('module', 'exports', 'require', output)(module, module.exports, localRequire);
    return module.exports;
  };
  return load(path.join(root, entry));
}

const { LeaveDialog } = loadTsx('components/listWizard/LeaveDialog.tsx');
const { OfficeShopTypeChoice } = loadTsx('components/listWizard/WizardFields.tsx');

const noop = () => {};
const leave = (props) => renderToStaticMarkup(React.createElement(LeaveDialog, {
  open: true, stage: 'choose', canDiscard: true, busy: null, onStay: noop, onSave: noop, onDiscard: noop, onConfirmDiscard: noop, onCancelDiscard: noop, ...props,
}));
const actions = (html) => [...html.matchAll(/data-leave-action="([^"]+)"( hidden="")?/g)].map((match) => match[1] + (match[2] ? ' (hidden)' : ''));

test('leaving asks to keep editing, save as a draft or discard; discarding needs its own confirmation', () => {
  const choose = leave();
  assert.match(choose, /<h2 id="listing-leave-title">Leave this listing\?<\/h2>/);
  assert.match(choose, /Save your progress as a draft, or discard your changes\./);
  assert.deepEqual(actions(choose), ['stay', 'save', 'discard']);

  const confirm = leave({ stage: 'confirm' });
  assert.match(confirm, /Discard this unpublished listing\? This cannot be undone\./);
  assert.deepEqual(actions(confirm), ['cancel-discard', 'confirm-discard']);
  assert.match(leave({ stage: 'confirm', busy: 'discard' }), /disabled="">Discarding…<\/button>/);

  assert.deepEqual(actions(leave({ canDiscard: false })), ['stay', 'save', 'discard (hidden)'], 'a paid listing cannot be discarded');
  assert.match(leave({ busy: 'save' }), /disabled="">Saving draft…<\/button>/);
});

test('the office/shop choice marks only the chosen kind as selected', () => {
  const render = (category) => renderToStaticMarkup(React.createElement(OfficeShopTypeChoice, { category, onChoose: noop }));
  const selected = (html) => [...html.matchAll(/data-office-shop-type="(\w+)" class="selected"/g)].map((match) => match[1]);
  assert.deepEqual(selected(render('shop')), ['shop']);
  assert.deepEqual(selected(render('office')), ['office']);
  assert.deepEqual(selected(render('airbnb')), []);
  const styles = fs.readFileSync(path.join(root, 'components', 'listWizard', 'listWizardStyles.ts'), 'utf8');
  assert.match(styles, /\(\.office-shop-type button, \.hotel-offer-option, \.property-purpose-option, \.sale-mode-option\)\.selected\{ border-color:var\(--red\); background:var\(--red-tint\); \}/);
  assert.match(styles, /\.submit-row \[hidden\]\{ display:none !important; \}/);
});

// ---------- The page's handlers (minimal source checks) ----------

const page = fs.readFileSync(path.join(root, 'pages', 'list.tsx'), 'utf8');
const checkout = fs.readFileSync(path.join(root, 'lib', 'listWizard', 'checkout.ts'), 'utf8');
const between = (start, end) => {
  const from = page.indexOf(start);
  assert.ok(from >= 0, `${start} is in list.tsx`);
  return page.slice(from, page.indexOf(end, from));
};
const payToList = between('const payToList = async', 'const goPro = async');
const goPro = between('const goPro = async', '// ---------- Publish');
const publishFlow = between('const publish = async', '// ---------- Review');

test('the review buttons: Pay and Go Pro are plain buttons with their own handlers; Publish submits', () => {
  assert.match(page, /<button type="button" className="pay-to-list-btn" id="pay-to-list-btn" hidden=\{!showPay\}[^\n]*onClick=\{\(event\) => \{ event\.preventDefault\(\); void payToList\(\); \}\}/);
  assert.match(page, /<button type="button" className="submit-btn" id="go-pro-btn" hidden=\{!showPay\}[^\n]*onClick=\{\(event\) => \{ event\.preventDefault\(\); void goPro\(\); \}\}/);
  assert.match(page, /<button type="submit" className="submit-btn" id="submit-btn" hidden=\{submitHidden\}/);
  assert.match(page, /= reviewActions\(paymentNeeded, flags\.entitlementChecked\)/);
  assert.match(page, /id="listing-entitlement-note" hidden=\{!entitlementNote\}>\s*\{entitlementNote \? 'Unable to confirm your listing allowance\. Refresh this page to try again before publishing or paying\.' : ''\}/);
  assert.match(page, /editMode \? 'Save changes' : 'Publish Listing'/);
});

test('Pay to list opens Paystack in the same tab after saving, and never publishes or uploads by itself', () => {
  assert.match(payToList, /if \(paying\.current \|\| publishing\.current\) return/);
  assert.match(payToList, /await prepareListingCheckout\(token, \(accessToken\) => persistBeforeCheckout\(accessToken, false\), startListingCheckout\)/);
  assert.ok(payToList.indexOf('prepareListingCheckout(') < payToList.indexOf('window.location.assign(url)'));
  assert.match(payToList, /window\.location\.assign\(url\);\s*redirected = true/);
  assert.match(payToList, /if \(!redirected && sessionRef\.current\) sessionRef\.current\.checkoutHandoff = false/);
  assert.doesNotMatch(payToList, /window\.open|requestSubmit|\/pricing|uploadListing/);
});

test('Go Pro saves the listing and then opens pricing, without paying or submitting', () => {
  assert.ok(goPro.indexOf('await persistBeforeCheckout(accessToken, true)') >= 0);
  assert.ok(goPro.indexOf('await persistBeforeCheckout(accessToken, true)') < goPro.indexOf('router.push(`/pricing?niche='));
  assert.doesNotMatch(goPro, /requestSubmit|saveListing\(|startListingCheckout|uploadListing/);
  assert.match(page, /persistBeforeCheckout = useCallback[\s\S]*?return saveForCheckout\(current, accessToken, saveProfileDraft, \{/);
});

test('only Save as draft and checkout create the listing shell', () => {
  assert.equal((page.match(/\.ensureShell\(/g) || []).length, 1, 'Save as draft');
  assert.equal((checkout.match(/\.ensureShell\(/g) || []).length, 1, 'checkout');
});

test('publishing reuses the listing a failed attempt made and stops before activation when media failed', () => {
  assert.match(publishFlow, /const existingId = editMode \? editListingId : current \? current\.listingId : null/);
  assert.match(publishFlow, /saveListing\(accessToken, existingId, listingPayload\(cat, stateForm, !existingId\)\)/);
  const failed = publishFlow.indexOf('if (mediaUploadBlocksPublish(editMode, files.length, failedCount))');
  const activation = publishFlow.indexOf('if (shouldActivate(', failed);
  assert.ok(failed >= 0 && activation > failed);
  const branch = publishFlow.slice(failed, activation);
  assert.match(branch, /Media upload failed, so the listing was not published\. Your private draft and uploaded media are preserved/);
  assert.match(branch, /return;/);
  assert.doesNotMatch(branch, /activateListing/);
  assert.doesNotMatch(publishFlow, /from\(['"]listing_booking_details['"]\)\.insert/, 'booking details go through the API');
  assert.match(publishFlow, /await draftCache\.clearForHost\(userId\)/);
  assert.match(publishFlow, /await current\.clearCheckoutState\(listingId\)/);
});

test('discarding removes the checkout copy, and nothing uses window.confirm or reopens a paid listing in edit mode', () => {
  assert.match(between('const discardAndLeave = async', '// ---------- Pay to list'), /if \(current\.listingId\) await current\.clearCheckoutState\(current\.listingId\)/);
  assert.doesNotMatch(page, /window\.confirm\(/);
  assert.doesNotMatch(page, /\/list\?edit=/);
});

test('wizard look: the app sidebar, one progress bar, messages in the page, scoped styles, motion', () => {
  const page = fs.readFileSync(path.join(root, 'pages', 'list.tsx'), 'utf8');
  assert.equal(fs.existsSync(path.join(root, 'components', 'listWizard', 'WizardChrome.tsx')), false, 'the wizard no longer draws its own sidebar');
  assert.doesNotMatch(page, /WizardSidebar|WizardTopNav|correction-step|step-tracker|progress-ring/, 'one progress bar instead of three');
  assert.match(page, /<WizardProgress step=\{step\} furthest=\{form\.furthestStep\} saveStatus=\{saveStatus\} onGo=\{jumpTo\} \/>/);
  assert.doesNotMatch(page, /window\.alert|reportValidity\(\)/, 'no browser pop-ups');
  assert.match(page, /report\(step, field, invalidMessage\(field\)\)/);
  assert.match(page, /field\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(page, /document\.addEventListener\('click', onClick, true\)/, 'Home in the app sidebar still asks to save or discard');
  assert.match(page, /'a\[href="\/host-home"\], a\[href\^="\/host-home\?"\], \[data-nav="home"\], \[data-nav="my-listings"\]'/);
  const frame = fs.readFileSync(path.join(root, 'components', 'listWizard', 'StepFrame.tsx'), 'utf8');
  assert.match(frame, /export const STEP_LABELS = \['Basics', 'Location', 'The space', 'Photos', 'Price & terms', 'Review'\] as const;/);
  assert.match(frame, /<StepAlert text=\{alert\} \/>/, 'the reason sits above Continue');
  const styles = fs.readFileSync(path.join(root, 'components', 'listWizard', 'listWizardStyles.ts'), 'utf8');
  for (const global of [/\n\s*\*\{/, /\n\s*body\{/, /\n\s*:root\{/, /\n\s*label\{/, /\n\s*input, textarea, select\{/, /\n\s*header\{/]) assert.doesNotMatch(styles, global, `no page-wide rule ${global}`);
  assert.match(styles, /#listing-page\.nav-forward \.step-frame\.active \.step-panel > :not\(\.panel-actions\)\{ animation:lw-from-right/);
  assert.match(styles, /#listing-page\.nav-back \.step-frame\.active \.step-panel > :not\(\.panel-actions\)\{ animation:lw-from-left/);
  assert.match(styles, /\.step-panel\{ position:relative; min-width:0; min-height:0; overflow-y:auto;/, 'the form scrolls inside the card, buttons kept in view');
  assert.match(styles, /\.panel-actions\{ position:fixed; z-index:20; left:0; right:0; bottom:calc\(4\.6rem/, 'on phones the buttons sit above the bottom bar');
  assert.match(styles, /\.wz-progress-fill::after\{[^}]*transition:transform var\(--motion-standard,250ms\) var\(--ease-in-out/);
  assert.match(styles, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*animation-duration:1ms !important/);
  const copy = fs.readFileSync(path.join(root, 'lib', 'listWizard', 'copy.ts'), 'utf8');
  assert.doesNotMatch(copy, /aboutEyebrow|Turn Your Space Into an Opportunity/);
});

test('six steps in a better order: the space before photos, price last; old drafts reopen on the same place', () => {
  const page = fs.readFileSync(path.join(root, 'pages', 'list.tsx'), 'utf8');
  const order = ['STEP 1 — About', 'STEP 2 — Location', 'STEP 3 — The space', 'STEP 4 — Photos', 'STEP 5 — Price & terms', 'STEP 6 — Review'].map((label) => page.indexOf(label));
  assert.ok(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1])), 'steps in order');
  assert.match(page, /id="location-neighbourhood" required/);
  assert.match(page, /id="location-city" required/);
  assert.doesNotMatch(page, /separated by a comma/, 'no comma rule: two boxes');
  const formState = loadTs(path.join(root, 'lib', 'listWizard', 'formState.ts'));
  assert.equal(formState.REVIEW_STEP, 6);
  assert.deepEqual({ ...formState.listingAreaParts({ 'location-text': 'Westlands, Nairobi' }) }, { neighbourhood: 'Westlands', city: 'Nairobi' }, 'older drafts fill both boxes');
  assert.deepEqual({ ...formState.listingAreaParts({ 'location-neighbourhood': 'West ', 'location-city': '' }) }, { neighbourhood: 'West ', city: '' }, 'typing keeps its spaces');
  assert.equal(formState.joinListingArea(' Karen ', 'Nairobi '), 'Karen, Nairobi');
  const drafts = loadTs(path.join(root, 'lib', 'listWizard', 'drafts.ts'));
  assert.deepEqual([1, 2, 3, 4, 5].map((step) => drafts.savedStep(step, undefined)), [1, 2, 4, 5, 6], 'five-step drafts: Photos 4, Pricing 5, Review 6');
  assert.deepEqual([3, 6, 9].map((step) => drafts.savedStep(step, drafts.STEP_VERSION)), [3, 6, 6]);
  const fields = fs.readFileSync(path.join(root, 'components', 'listWizard', 'WizardFields.tsx'), 'utf8');
  const space = fields.slice(fields.indexOf('export function SpaceFields'), fields.indexOf('export function BookingFields'));
  for (const id of ['size-or-type', 'max-guests', 'property-bedroom-type', 'property-bathrooms', 'property-units-available']) assert.ok(space.includes(`'${id}'`), `${id} is under "The space"`);
  const booking = fields.slice(fields.indexOf('export function BookingFields'));
  assert.ok(booking.indexOf('id="property-sale-section"') < booking.indexOf('id="short-stay-fields"'), 'the sale price follows the rent price');
});

test('office and shop: about 25 questions; amounts the server needs are required when they apply', () => {
  const office = fs.readFileSync(path.join(root, 'components', 'listWizard', 'OfficeShopFields.tsx'), 'utf8');
  for (const gone of ['os-power-note', 'os-internet-note', 'os-accessibility-note', 'os-ceiling-height', 'os-room-count', 'os-foot-traffic', 'os-nearby-anchors', 'os-lock-in', 'os-notice-period', 'os-renewal', 'os-payment-methods', 'os-rent-increases', 'os-add-charge', 'os-permitted-uses', 'os-subletting', 'os-documents-on-request']) {
    assert.ok(!office.includes(`'${gone}'`) && !office.includes(`"${gone}"`), `${gone} is no longer asked`);
  }
  assert.match(office, /required=\{conditions\.serviceAmountRequired\}/);
  assert.match(office, /required=\{conditions\.utilitiesAmountRequired\}/);
  assert.match(office, /required=\{conditions\.parkingAmountRequired\}/);
  assert.match(office, /card\.slot !== 'documents'/, 'floor plan and policy only');
  const os = loadTs(path.join(root, 'lib', 'listWizard', 'officeShop.ts'));
  const conditions = os.officeShopConditions({ 'os-service-charge': 'not_included', 'os-utilities': 'fixed_fee', 'os-parking-cost': 'paid', 'os-pricing-basis': 'per_desk' }, 'office');
  assert.equal(conditions.serviceAmountRequired, true);
  assert.equal(conditions.utilitiesAmountRequired, true);
  assert.equal(conditions.parkingAmountRequired, true);
  assert.equal(conditions.desksForPricing, true);
  // An older listing keeps answers the form no longer asks.
  const patch = os.hydrateOfficeShopDetails({ subtype: 'private_office', amenities: { power_note: '3-phase' }, lease: { lock_in: '12 months' } });
  const form = { fields: patch.fields, officeShopAmenitySelections: {}, officeShopPermittedUses: [], officeShopCharges: [] };
  const saved = os.collectOfficeShopDetails(form, 'office');
  assert.equal(saved.amenities.power_note, '3-phase');
  assert.equal(saved.lease.lock_in, '12 months');
});
