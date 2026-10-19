const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const addAccountModalCode = fs.readFileSync(
  path.join(__dirname, '../components/AddAccountModal.jsx'),
  'utf8'
);
const sharedClientSidebarCode = fs.readFileSync(
  path.join(__dirname, '../components/SharedClientSidebar.jsx'),
  'utf8'
);
const sharedHostSidebarCode = fs.readFileSync(
  path.join(__dirname, '../components/SharedHostSidebar.jsx'),
  'utf8'
);
const accountSwitcherCode = fs.readFileSync(
  path.join(__dirname, '../public/js/account-switcher.js'),
  'utf8'
);
const authCallbackCode = fs.readFileSync(
  path.join(__dirname, '../legacy-pages/auth-callback.html'),
  'utf8'
);
const appJsCode = fs.readFileSync(
  path.join(__dirname, '../pages/_app.js'),
  'utf8'
);
const darkThemeCss = fs.readFileSync(
  path.join(__dirname, '../public/js/varoom-dark-theme.css'),
  'utf8'
);

test('AddAccountModal has the required UI structure, branding, and ordering', () => {
  // Brand logo
  assert.match(addAccountModalCode, /add-account-brand-va.*Va/, 'Displays VaRoom logo Va');
  assert.match(addAccountModalCode, /add-account-brand-room.*Room/, 'Displays VaRoom logo Room');
  assert.match(addAccountModalCode, /#bd2337/, 'Uses VaRoom signature red accent');

  // Title and subtitle
  assert.match(addAccountModalCode, /Add another account/, 'Contains heading "Add another account"');
  assert.match(
    addAccountModalCode,
    /Sign in to add an existing account to VaRoom\./,
    'Contains explanation "Sign in to add an existing account to VaRoom."'
  );

  // Back / close button
  assert.match(addAccountModalCode, /aria-label="Back"/, 'Contains back button control');

  // Order of authentication options in the card markup:
  const cardMarkupStart = addAccountModalCode.indexOf('<div className="add-account-card"');
  assert.ok(cardMarkupStart > -1, 'Contains add-account-card markup');
  const cardMarkup = addAccountModalCode.slice(cardMarkupStart);

  // 1. Continue with Google
  const googleIndex = cardMarkup.indexOf('Continue with Google');
  assert.ok(googleIndex > -1, 'Contains Continue with Google');

  // 2. "or" divider
  const dividerIndex = cardMarkup.indexOf('add-account-divider');
  assert.ok(dividerIndex > -1, 'Contains "or" divider');
  assert.ok(googleIndex < dividerIndex, 'Google button comes before "or" divider');

  // 3. Email input
  const emailIndex = cardMarkup.indexOf('type="email"');
  assert.ok(emailIndex > -1, 'Contains email address input');
  assert.ok(dividerIndex < emailIndex, 'Divider comes before email input');

  // 4. Password input with show/hide toggle
  const passwordIndex = cardMarkup.indexOf('add-account-pw-toggle');
  assert.ok(passwordIndex > -1, 'Contains password show/hide toggle');
  assert.ok(emailIndex < passwordIndex, 'Email input comes before password input');

  // 5. Add Account submit button
  const submitBtnIndex = cardMarkup.indexOf('add-account-submit-btn');
  assert.ok(submitBtnIndex > -1, 'Contains Add Account submit button');
  assert.ok(passwordIndex < submitBtnIndex, 'Password input comes before Add Account button');
});

test('AddAccountModal does not contain forbidden bright blue or purple styling', () => {
  // Check for forbidden color words or hex values in the modal styling
  assert.doesNotMatch(addAccountModalCode, /#[0-9a-fA-F]{6}.*blue/i, 'No blue hex definitions');
  assert.doesNotMatch(addAccountModalCode, /#[0-9a-fA-F]{6}.*purple/i, 'No purple hex definitions');
  assert.doesNotMatch(addAccountModalCode, /border-color:\s*(#00f|#1d9bf0|blue|purple)/i, 'No blue or purple borders');
});

test('AddAccountModal uses isolated Supabase client to avoid logging out active session', () => {
  // Verifies that tempClient is created with persistSession: false
  assert.match(
    addAccountModalCode,
    /persistSession:\s*false/,
    'Uses an isolated client with persistSession: false so active session is untouched'
  );
  assert.match(
    addAccountModalCode,
    /signInWithPassword/,
    'Uses Supabase signInWithPassword'
  );
  assert.match(
    addAccountModalCode,
    /This account is already signed in\./,
    'Guards against adding the current active account'
  );
  assert.match(
    addAccountModalCode,
    /This account is already linked\./,
    'Guards against adding duplicate accounts'
  );
  assert.match(
    addAccountModalCode,
    /Account limit reached \(3\/3\)/,
    'Enforces 3-account limit'
  );
});

test('SharedClientSidebar and SharedHostSidebar trigger the in-app modal instead of redirecting', () => {
  // Client Sidebar
  assert.match(
    sharedClientSidebarCode,
    /openAddAccountModal|varoom:open-add-account/,
    'SharedClientSidebar triggers in-app add account modal'
  );
  assert.doesNotMatch(
    sharedClientSidebarCode,
    /window\.location\.href\s*=\s*`\/login\.html\?mode=add/,
    'SharedClientSidebar does not redirect to login.html?mode=add'
  );

  // Host Sidebar
  assert.match(
    sharedHostSidebarCode,
    /openAddAccountModal|varoom:open-add-account/,
    'SharedHostSidebar triggers in-app add account modal'
  );
  assert.doesNotMatch(
    sharedHostSidebarCode,
    /window\.location\.href\s*=\s*`\/login\.html\?mode=add/,
    'SharedHostSidebar does not redirect to login.html?mode=add'
  );
});

test('account-switcher.js startAddAccount opens in-app modal and exports openAddAccountModal', () => {
  assert.match(
    accountSwitcherCode,
    /function startAddAccount[\s\S]*openAddAccountModal\(\)/,
    'startAddAccount invokes openAddAccountModal'
  );
  assert.match(
    accountSwitcherCode,
    /openAddAccountModal:\s*openAddAccountModal/,
    'Exports openAddAccountModal on VaRoomAccountSwitcher'
  );
  assert.match(
    accountSwitcherCode,
    /persistSession:\s*false/,
    'Vanilla modal uses persistSession: false'
  );
});

test('_app.js renders AddAccountModal globally across the application', () => {
  assert.match(appJsCode, /import AddAccountModal from '\.\.\/components\/AddAccountModal';/, 'Imports AddAccountModal');
  assert.match(appJsCode, /<AddAccountModal \/>/, 'Mounts AddAccountModal');
});

test('auth-callback.html supports in-app addAccount popup and redirect flow', () => {
  assert.match(authCallbackCode, /isAddAccount/, 'Checks isAddAccount parameter');
  assert.match(authCallbackCode, /VAROOM_ADD_ACCOUNT_SUCCESS/, 'Posts success message to opener window');
});

test('varoom-dark-theme.css contains dark mode glassmorphism rules for the modal', () => {
  assert.match(darkThemeCss, /\[data-theme="dark"\]\s+\.add-account-card/, 'Defines dark mode glass card');
  assert.match(darkThemeCss, /\[data-theme="dark"\]\s+\.add-account-input/, 'Defines dark mode inputs');
  assert.match(darkThemeCss, /\[data-theme="dark"\]\s+\.add-account-google-btn/, 'Defines dark mode Google button');
});
