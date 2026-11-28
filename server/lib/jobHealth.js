'use strict';

// The server's background jobs: each runs on a timer, never overlaps itself,
// logs its outcome, and records its last run and last error for the admin
// health panel (GET /admin/health). Records live in this process.

const jobs = new Map();

/**
 * Runs `run` after `first` ms and then every `every` ms. `describe(result)`
 * returns a line to log after a run with something to say, or null.
 */
function scheduleJob(name, { first, every }, run, describe = () => null) {
  const entry = { name, every_ms: every, last_run_at: null, last_ok_at: null, last_error: null, last_error_at: null, running: false };
  jobs.set(name, entry);
  const tick = () => {
    if (entry.running) return Promise.resolve();
    entry.running = true;
    entry.last_run_at = new Date().toISOString();
    return Promise.resolve().then(run).then((result) => {
      entry.last_ok_at = new Date().toISOString();
      entry.last_error = null;
      const line = describe(result);
      if (line) console.log(line);
    }, (error) => {
      entry.last_error = (error && error.message) || String(error);
      entry.last_error_at = new Date().toISOString();
      console.error(`${name} failed:`, error);
    }).finally(() => { entry.running = false; });
  };
  setTimeout(tick, first).unref();
  setInterval(tick, every).unref();
  return tick;
}

/** Every job's record, for the health panel. */
const jobStatus = () => [...jobs.values()].map((entry) => ({ ...entry }));

module.exports = { scheduleJob, jobStatus };
