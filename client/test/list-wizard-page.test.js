'use strict';

// The listing wizard page (pages/list.tsx) and its dialogs. The components
// are rendered; what lives only in the page's event handlers (the order of
// the publish and pay flows) keeps a minimal source check, since those
// handlers close over React state. Their logic is tested in
// list-wizard-flows.test.js (reviewActions, fetchListingEntitlement,
// uploadPendingMedia) and pricing-page.test.js (startListingTierCheckout).

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
const { ListingTierChoice } = loadTsx('components/listWizard/ListingTierChoice.tsx');

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

test('the Silver / Gold choice: both plans with their prices, Gold first in focus, a way back home', () => {
  const html = renderToStaticMarkup(React.createElement(ListingTierChoice, { onChoose: noop }));
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="tier-choice-title"/);
  assert.match(html, /<h2 id="tier-choice-title">Choose your listing plan<\/h2>/);
  assert.match(html, /It stays live for 30 days from when you publish it\./);
  assert.deepEqual([...html.matchAll(/class="tier-choice-name">(\w+)</g)].map((match) => match[1]), ['Silver', 'Gold']);
  assert.deepEqual([...html.matchAll(/<button type="button">Pay KSh (?:<!-- -->)?([\d,]+)<\/button>/g)].map((match) => match[1]), ['1,000', '2,000']);
  assert.match(html, /tier-choice-option featured[\s\S]*Gold/, 'Gold is the highlighted plan');
  assert.match(html, /href="\/host-home"[^>]*>Not now, back to Home<\/a>/);
});

const { CheckoutWindow, CHECKOUT_STYLES } = loadTsx('components/billing/CheckoutWindow.tsx');
const gold = { name: 'Gold listing', priceKes: 2000, per: '/listing', lines: ['One listing live for 30 days', 'Eligible for the landing page; featuring is not guaranteed'] };
const checkout = (props) => renderToStaticMarkup(React.createElement(CheckoutWindow, {
  open: true, item: gold, allowMpesa: true, paidText: 'Ready.', start: async () => ({}), confirm: async () => 'pending', onPaid: noop, onClose: noop, ...props,
}));
const text = (html) => html.replace(/<!-- -->/g, '');

test('the checkout window: VaRoom summary and M-Pesa first, Card second, never a Paystack page', () => {
  const html = text(checkout());
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="vr-checkout-title"/);
  assert.match(html, /<span class="va">Va<\/span>Room checkout/);
  assert.match(html, /Gold listing/);
  assert.match(html, /<h2 id="vr-checkout-title">Pay KSh 2,000<\/h2>/);
  assert.deepEqual([...html.matchAll(/role="tab" aria-selected="(true|false)"[^>]*>([\w-]+)</g)].map((match) => [match[2], match[1]]), [['M-Pesa', 'true'], ['Card', 'false']]);
  assert.match(html, /<label for="vr-checkout-phone">M-Pesa number<\/label>/);
  assert.match(html, /type="tel"[^>]*placeholder="0712 345 678"/);
  assert.match(html, /You&#x27;ll get a prompt on your phone to enter your M-Pesa PIN\./);
  assert.match(html, />Pay KSh 2,000 with M-Pesa<\/button>/);
  assert.match(html, /Payments are processed securely by Paystack\./);
  assert.doesNotMatch(html, /iframe|checkout\.paystack\.com/);
  assert.equal(checkout({ open: false }), '');

  const plan = text(checkout({ allowMpesa: false, item: { ...gold, name: 'Pro plan', per: '/month' } }));
  assert.doesNotMatch(plan, /role="tablist"|M-Pesa number/, 'monthly plans renew on cards only');
  assert.match(plan, />Pay KSh 2,000 by card<\/button>/);
  assert.match(plan, /A secure Paystack card window opens on top of this one\. You stay on VaRoom\./);
});

test('the checkout window is dark like the auth panel, above the page, full screen on phones; the server confirms every payment', () => {
  assert.match(CHECKOUT_STYLES, /\.vr-checkout\{ position:fixed; inset:0; z-index:9000;/);
  assert.match(CHECKOUT_STYLES, /backdrop-filter:blur\(10px\)/);
  assert.match(CHECKOUT_STYLES, /\.vr-checkout-card\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(CHECKOUT_STYLES, /@media \(max-width:760px\)\{[\s\S]*\.vr-checkout-card\{ grid-template-columns:minmax\(0,1fr\);[^}]*min-height:100dvh/);
  const source = fs.readFileSync(path.join(root, 'components', 'billing', 'CheckoutWindow.tsx'), 'utf8');
  // M-Pesa: the window waits for the server, which verifies with Paystack, through the 180 s PIN window and a grace period.
  assert.match(source, /await confirm\(started\.reference, elapsed < MPESA_WINDOW_MS \+ MPESA_GRACE_MS\)/);
  assert.match(source, /if \(state === 'paid'\) \{ finish\(mine, started\.reference\); return; \}/);
  // Card: Paystack's popup; a popup "success" is confirmed by the server before anything unlocks.
  assert.match(source, /if \(result\.outcome === 'success'\) \{ await confirmCard\(mine, started\.reference\); return; \}/);
  // A blocked popup offers Paystack's own page, after the caller saves what it needs.
  assert.match(source, /try \{ await onFallback\?\.\(\); \}[\s\S]*window\.location\.assign\(fallbackUrl\)/);
  assert.match(source, /createPortal\(layer, document\.body\)/);
});

test('a blocked Paystack card window never traps the host (Brave Shields)', () => {
  const source = fs.readFileSync(path.join(root, 'components', 'billing', 'CheckoutWindow.tsx'), 'utf8');
  const card = source.slice(source.indexOf('const payCard = async'), source.indexOf('const leaveForPaystack'));
  // Paystack's own page is offered from the moment its card window is asked for, not only after an error.
  const opening = card.slice(card.indexOf("setStage('card');"), card.indexOf('await payByCard('));
  assert.match(opening, /setFallbackUrl\(started\.authorizationUrl\);/);
  // No sign of the card window within 8 s: say so (it may be blocked) instead of waiting for ever.
  assert.match(source, /const POPUP_SHOW_MS = 8000;/);
  assert.match(card, /if \(!shown && attempt\.current === mine\) setError\(BLOCKED_TEXT\);/);
  assert.match(source, /Brave Shields or an ad blocker may be stopping it\. Open Paystack in this tab instead/);
  // Close always works; the window never disables it.
  assert.match(source, /const close = useCallback\(\(\) => \{ attempt\.current \+= 1; onClose\(\); \}, \[onClose\]\);/);
  assert.doesNotMatch(source, /aria-label="Close"[^>]*disabled/);
  const popup = fs.readFileSync(path.join(root, 'lib', 'billing', 'paystackPopup.ts'), 'utf8');
  assert.match(popup, /resumeTransaction\(accessCode, \{\s*onLoad,/, 'Paystack tells us when its window has actually shown');
});

const { ReviewHero } = loadTsx('components/listWizard/ReviewStep.tsx');

test('the review carousel shows every chosen photo and video, with arrows, dots and a count', () => {
  const media = [{ url: 'blob:a', video: false }, { url: 'blob:b', video: true }, { url: 'blob:c', video: false }];
  const html = text(renderToStaticMarkup(React.createElement(ReviewHero, { media, index: 1, onIndex: noop })));
  assert.match(html, /aria-roledescription="carousel"/);
  assert.equal((html.match(/class="review-gallery-slide"/g) || []).length, 3);
  assert.match(html, /<img src="blob:a" alt="Listing cover photo"\/>/);
  assert.match(html, /<video src="blob:b" muted="" playsinline="" controls="">/);
  assert.match(html, /class="review-gallery-count" aria-live="polite">2 \/ 3<\/span>/);
  assert.equal((html.match(/class="review-gallery-dot( active)?"/g) || []).length, 3);
  assert.match(html, /class="review-gallery-dot active" aria-label="Show photo 2" aria-current="true"/);
  assert.match(html, /aria-label="Previous photo"[\s\S]*aria-label="Next photo"/);

  const single = renderToStaticMarkup(React.createElement(ReviewHero, { media: media.slice(0, 1), index: 0, onIndex: noop }));
  assert.doesNotMatch(single, /review-gallery-arrow|review-gallery-count/, 'one photo needs no controls');
  const none = renderToStaticMarkup(React.createElement(ReviewHero, { media: [], index: 0, onIndex: noop }));
  assert.match(none, /step-5\.jpg/, 'no media keeps the step picture');

  const styles = fs.readFileSync(path.join(root, 'components', 'listWizard', 'listWizardStyles.ts'), 'utf8');
  const wide = styles.slice(0, styles.indexOf('@media (max-width:900px)'));
  assert.match(wide, /#listing-page \.review-gallery\{ position:absolute; inset:0;/, 'on every screen size, not phones only');
  const listPage = fs.readFileSync(path.join(root, 'pages', 'list.tsx'), 'utf8');
  assert.match(listPage, /cover=\{reviewMedia\[Math\.min\(reviewIndex, reviewMedia\.length - 1\)\] \|\| null\}/, 'the review card thumbnail follows the carousel');
});

// ---------- The page's handlers (minimal source checks) ----------

const page = fs.readFileSync(path.join(root, 'pages', 'list.tsx'), 'utf8');
const between = (start, end) => {
  const from = page.indexOf(start);
  assert.ok(from >= 0, `${start} is in list.tsx`);
  return page.slice(from, page.indexOf(end, from));
};
const tierPayment = between('// ---------- Silver / Gold ----------', '// ---------- Publish');
const publishFlow = between('const publish = async', '// ---------- Review');

test('the review has only Publish; Pay to list and Go Pro are gone', () => {
  assert.match(page, /<button type="submit" className="submit-btn" id="submit-btn" hidden=\{submitHidden\}/);
  assert.match(page, /= reviewActions\(paymentNeeded, flags\.entitlementChecked\)/);
  assert.match(page, /id="listing-entitlement-note" hidden=\{!entitlementNote\}>\s*\{entitlementNote \? 'Unable to confirm your listing allowance\. Refresh this page to try again before publishing or paying\.' : ''\}/);
  assert.match(page, /editMode \? 'Save changes' : 'Publish Listing'/);
  assert.doesNotMatch(page, /pay-to-list-btn|go-pro-btn|payToList|goPro|\/pricing\?niche=/);
});

test('the Silver / Gold choice covers the showing step until a paid listing is there to use', () => {
  assert.match(page, /const tierChoice = showTierChoice && !flags\.publishBlocked \? <ListingTierChoice /);
  for (let step = 1; step <= 6; step += 1) assert.ok(page.includes(`<StepFrame step={${step}} active={step === ${step}} overlay={overlayFor(${step})}`), `step ${step}`);
  assert.match(page, /hasListingCredit: hasListingCredit\(flags\)/, 'a paid listing counts as covered');
  assert.match(page, /'Choose Silver or Gold before publishing this listing\.'/);
});

test('paying for Silver / Gold happens in the VaRoom window over the wizard; the draft carries on', () => {
  assert.match(page, /<ListingTierChoice onChoose=\{setCheckoutTier\} \/>/);
  assert.match(page, /<CheckoutWindow open=\{checkoutTier !== null\} allowMpesa/);
  assert.match(tierPayment, /startListingTierCheckout\(accessToken, checkoutTier, payment, \{ draft: !editMode && current \? current\.draftId : null, edit: editMode \? editListingId : null \}\)/);
  assert.match(tierPayment, /return checkListingPayment\(accessToken, reference, \{ waitingForPin \}\)/);
  assert.match(tierPayment, /listingCredits: \{ \.\.\.previous\.listingCredits, \[tier\]: previous\.listingCredits\[tier\] \+ 1 \}/, 'the confirmed payment unlocks the wizard in place');
  // Only Paystack's own page (the fallback) leaves: the draft save finishes and autosave stops first.
  assert.ok(tierPayment.indexOf('await current.settled()') < tierPayment.indexOf('current.checkoutHandoff = true'));
  assert.doesNotMatch(page, /window\.location\.assign/, 'the wizard never leaves for Paystack by itself');
  assert.doesNotMatch(tierPayment, /requestSubmit|saveListing\(|uploadListing/);
});

test('only Save as draft creates the listing shell', () => {
  assert.equal((page.match(/\.ensureShell\(/g) || []).length, 1, 'Save as draft');
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
