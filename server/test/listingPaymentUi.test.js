'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const listingPage = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'legacy-pages', 'list.html'), 'utf8');

test('review payment actions are non-submit buttons with independent handlers', () => {
  assert.match(listingPage, /\.submit-row \[hidden\]\{ display:none !important; \}/);
  assert.match(listingPage, /<button type="button" class="pay-to-list-btn" id="pay-to-list-btn"/);
  assert.match(listingPage, /<button type="button" class="submit-btn" id="go-pro-btn"/);
  assert.match(listingPage, /<button type="submit" class="submit-btn" id="submit-btn"/);

  const goProStart = listingPage.indexOf("document.getElementById('go-pro-btn').addEventListener('click'");
  assert.notEqual(goProStart, -1);
  const goProHandler = listingPage.slice(goProStart, listingPage.indexOf('</script>', goProStart));
  assert.match(goProHandler, /window\.location\.assign\('\/pricing\?/);
  assert.doesNotMatch(goProHandler, /requestSubmit|\/api\/listings|listing-checkout|uploadVideoToR2/);

  const payClickStart = listingPage.indexOf("document.getElementById('pay-to-list-btn').addEventListener");
  const payClickEnd = listingPage.indexOf("document.getElementById('go-pro-btn').addEventListener", payClickStart);
  const payClickHandler = listingPage.slice(payClickStart, payClickEnd);
  assert.match(payClickHandler, /startPayToListFlow\(\)/);
  assert.doesNotMatch(payClickHandler, /requestSubmit|\/pricing/);
});

test('one-time checkout verifies payment before requesting listing publication', () => {
  const flowStart = listingPage.indexOf('async function startPayToListFlow()');
  const flowEnd = listingPage.indexOf("document.getElementById('pay-to-list-btn').addEventListener", flowStart);
  const flow = listingPage.slice(flowStart, flowEnd);
  const verifyIndex = flow.indexOf("payment.status === 'succeeded'");
  const publishIndex = flow.indexOf("document.getElementById('list-form').requestSubmit()");

  assert.match(flow, /\/api\/billing\/listing-checkout/);
  assert.match(flow, /\/api\/billing\/payments\//);
  assert.match(flow, /payment_draft: true/);
  assert.doesNotMatch(flow, /uploadVideoToR2|storage\.from\('listing-photos'\)\.upload/);
  assert.match(flow, /paymentFlowInProgress \|\| publishInProgress/);
  assert.ok(verifyIndex >= 0 && publishIndex > verifyIndex, 'publication must follow server-confirmed payment');
});
