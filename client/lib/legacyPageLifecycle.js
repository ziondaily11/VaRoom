function createLegacyPageLifecycle() {
  const controller = new AbortController();
  const cleanups = [];
  let active = true;
  let initialization = null;

  function runCleanup(cleanup) {
    try {
      cleanup();
    } catch (error) {
      console.error('Legacy page cleanup failed:', error);
    }
  }

  function onCleanup(cleanup) {
    if (typeof cleanup !== 'function') {
      throw new TypeError('Legacy page cleanup must be a function.');
    }

    if (!active) {
      runCleanup(cleanup);
      return;
    }

    cleanups.push(cleanup);
  }

  function dispose() {
    if (!active) return;
    active = false;
    controller.abort();

    while (cleanups.length) {
      runCleanup(cleanups.pop());
    }
  }

  async function initialize(initializer, context) {
    if (!active) return;
    if (initialization) {
      throw new Error('Legacy page lifecycle can only be initialized once.');
    }
    if (typeof initializer !== 'function') {
      throw new TypeError('Legacy page initializer must be a function.');
    }

    initialization = Promise.resolve().then(() => initializer({
      ...(context || {}),
      signal: controller.signal,
      isActive: () => active,
      onCleanup,
    }));

    try {
      await initialization;
    } catch (error) {
      dispose();
      throw error;
    }
  }

  return {
    signal: controller.signal,
    isActive: () => active,
    initialize,
    dispose,
  };
}

module.exports = { createLegacyPageLifecycle };
