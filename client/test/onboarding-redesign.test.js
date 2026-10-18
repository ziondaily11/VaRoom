const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const onboardingHtmlPath = path.join(__dirname, '..', 'legacy-pages', 'onboarding.html');
const onboardingHtml = fs.readFileSync(onboardingHtmlPath, 'utf8');

test('Client Onboarding: renders one card only with required heading and subtitle', () => {
  assert.ok(onboardingHtml.includes('id="cardClientPreferences"'), 'Contains client card element');
  assert.ok(onboardingHtml.includes('What are you hoping to find?'), 'Contains heading "What are you hoping to find?"');
  assert.ok(
    onboardingHtml.includes("Choose the types of spaces you're interested in right now."),
    'Contains client subtitle'
  );
});

test('Client Onboarding: presents the 5 required space categories with descriptions', () => {
  const categories = [
    { name: 'Airbnbs', desc: 'Unique stays that feel like home', code: 'airbnb' },
    { name: 'Hotels', desc: 'Comfort, service and easy booking', code: 'hotel' },
    { name: 'Property to let / buy', desc: 'Your next home or investment', code: 'property' },
    { name: 'Shops &amp; offices', desc: 'Spaces for work and business', code: 'office' },
    { name: 'Event venues', desc: 'The right setting for your occasion', code: 'venue' }
  ];

  categories.forEach((cat) => {
    assert.ok(onboardingHtml.includes(cat.name), `Contains category name ${cat.name}`);
    assert.ok(onboardingHtml.includes(cat.desc), `Contains category description ${cat.desc}`);
    assert.ok(onboardingHtml.includes(`data-category="${cat.code}"`), `Contains category code ${cat.code}`);
  });
});

test('Client Onboarding: supports multi-selection and timeline options with proper destinations', () => {
  // Discovery timeline
  assert.ok(onboardingHtml.includes('When are you looking?'), 'Contains timeline heading');
  assert.ok(onboardingHtml.includes('Looking soon'), 'Contains Looking soon');
  assert.ok(onboardingHtml.includes("I'm ready to find it"), 'Contains Looking soon description');
  assert.ok(onboardingHtml.includes('Just browsing'), 'Contains Just browsing');
  assert.ok(onboardingHtml.includes("I'm exploring for now"), 'Contains Just browsing description');

  // Navigation destinations
  assert.ok(
    onboardingHtml.includes("window.location.href = '/marketplace'") ||
    onboardingHtml.includes('window.location.href = "/marketplace"'),
    'Looking soon navigates to /marketplace'
  );
  assert.ok(
    onboardingHtml.includes("window.location.href = '/client-home'") ||
    onboardingHtml.includes('window.location.href = "/client-home"'),
    'Just browsing navigates to /client-home (Discover)'
  );
});

test('Client Onboarding: does not ask clients for username, phone, location, photo, or display name', () => {
  // Client section must only contain client preferences card
  const clientCardIndex = onboardingHtml.indexOf('id="cardClientPreferences"');
  const clientCardEndIndex = onboardingHtml.indexOf('</section>', clientCardIndex);
  const clientCardMarkup = onboardingHtml.slice(clientCardIndex, clientCardEndIndex);

  assert.ok(!clientCardMarkup.includes('id="inpUsername"'), 'Client card has no username input');
  assert.ok(!clientCardMarkup.includes('id="inpPhone"'), 'Client card has no phone input');
  assert.ok(!clientCardMarkup.includes('id="inpLocation"'), 'Client card has no location input');
  assert.ok(!clientCardMarkup.includes('id="hostPhotoInput"'), 'Client card has no photo input');
  assert.ok(!clientCardMarkup.includes('id="inpDiscoverName"'), 'Client card has no display name input');
});

test('Host Onboarding Card 1: contains profile setup heading, username, phone, location', () => {
  assert.ok(onboardingHtml.includes('id="cardHostProfile"'), 'Contains host profile setup card');
  assert.ok(onboardingHtml.includes('A little more you.'), 'Contains heading "A little more you."');
  assert.ok(
    onboardingHtml.includes("Let's set up your profile so people can put a face to your name."),
    'Contains profile subtitle'
  );
  assert.ok(onboardingHtml.includes('MAKE YOURSELF AT HOME'), 'Contains badge text');
  assert.ok(onboardingHtml.includes('id="inpUsername"'), 'Contains username input');
  assert.ok(onboardingHtml.includes('Choose a username'), 'Contains username placeholder');
  assert.ok(onboardingHtml.includes('id="inpPhone"'), 'Contains phone input');
  assert.ok(onboardingHtml.includes('+254'), 'Contains Kenya +254 country code default');
  assert.ok(onboardingHtml.includes('Your phone number stays private.'), 'Contains privacy note');
  assert.ok(onboardingHtml.includes('id="inpLocation"'), 'Contains location input');
});

test('Host Onboarding Card 1: preserves photo upload and repositioning functionality', () => {
  assert.ok(onboardingHtml.includes('id="avatarBox"'), 'Contains avatar box container');
  assert.ok(onboardingHtml.includes('id="avatarPreview"'), 'Contains avatar preview image');
  assert.ok(onboardingHtml.includes('createCroppedPhoto'), 'Contains canvas crop helper');
  assert.ok(onboardingHtml.includes('initialiseCrop'), 'Contains crop initialization helper');
  assert.ok(onboardingHtml.includes('pointerdown') && onboardingHtml.includes('pointermove'), 'Maintains touch/drag pointer handlers');
  assert.ok(onboardingHtml.includes('wheel'), 'Maintains wheel zoom handler');
});

test('Host Onboarding Card 2: contains listing category single-selection and display name', () => {
  assert.ok(onboardingHtml.includes('id="cardHostCategory"'), 'Contains host category card');
  assert.ok(onboardingHtml.includes('What will you be listing?'), 'Contains heading "What will you be listing?"');
  assert.ok(
    onboardingHtml.includes('Choose the category that best describes your place.'),
    'Contains listing category subtitle'
  );
  assert.ok(onboardingHtml.includes("How you'll appear in Varoom's Discover"), 'Contains display name label');
  assert.ok(onboardingHtml.includes('e.g. Palm View Apartments'), 'Contains display name placeholder');
  assert.ok(
    onboardingHtml.includes("window.location.href = '/host-home'") ||
    onboardingHtml.includes('window.location.href = "/host-home"'),
    'Host completing onboarding navigates to /host-home (Discover)'
  );
});

test('Design System: single outline border, username spinner, and no watermarks', () => {
  assert.ok(!onboardingHtml.includes('card-layer-back'), 'No second layered card outline (single outline only)');
  assert.ok(onboardingHtml.includes('card-foreground'), 'Contains foreground card container');
  assert.ok(onboardingHtml.includes('id="usernameSpinner"'), 'Contains username availability spinner');
  assert.ok(!onboardingHtml.includes('ambient-sparkle'), 'Ambient sparkle watermarks removed');
  assert.ok(!onboardingHtml.includes('btn-sparkle'), 'Button sparkle watermark removed');
  assert.ok(onboardingHtml.includes('--card-border: rgba(255, 255, 255, 0.12)'), 'Darkmode defines single subtle grey outline border');
});
