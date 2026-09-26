require('dotenv').config();
const { processPendingMediaCleanup } = require('../lib/mediaCleanupService');

processPendingMediaCleanup(500).then((summary) => {
  console.log('VaRoom media cleanup');
  console.log(`total=${summary.total} deleted=${summary.deleted} deferred=${summary.deferred} failed=${summary.failed}`);
  if (summary.failed > 0) process.exitCode = 1;
}).catch((error) => {
  console.error('Media cleanup stopped:', error.message);
  process.exitCode = 1;
});
