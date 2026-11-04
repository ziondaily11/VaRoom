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
  assert.match(styles, /\.office-shop-type button\.selected\{ border-color:#050505; background:#050505; color:#fff; \}/);
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
