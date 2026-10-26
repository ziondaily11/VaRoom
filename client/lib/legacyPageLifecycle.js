function createLegacyPageLifecycle() {
  const controller = new AbortController();
  const cleanups = [];
  const observerCleanups = new WeakMap();
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
      return function () {};
    }

    cleanups.push(cleanup);
    let registered = true;
    return function unregisterCleanup() {
      if (!registered) return;
      registered = false;
      const index = cleanups.lastIndexOf(cleanup);
      if (index !== -1) cleanups.splice(index, 1);
    };
  }

  function dispose() {
    if (!active) return;
    active = false;
    controller.abort();

    while (cleanups.length) {
      runCleanup(cleanups.pop());
    }
  }

  function listen(target, type, listener, options) {
    if (!target || typeof target.addEventListener !== 'function') return function () {};
    target.addEventListener(type, listener, options);
    const remove = () => target.removeEventListener(type, listener, options);
    onCleanup(remove);
    return remove;
  }

  function trackObserver(observer) {
    if (observer && typeof observer.disconnect === 'function') {
      const unregister = onCleanup(() => observer.disconnect());
      observerCleanups.set(observer, unregister);
    }
    return observer;
  }

  function disconnectObserver(observer) {
    if (!observer) return;
    const unregister = observerCleanups.get(observer);
    if (unregister) {
      unregister();
      observerCleanups.delete(observer);
    }
    if (typeof observer.disconnect === 'function') observer.disconnect();
  }

  function trackSubscription(subscription) {
    const unsubscribe = typeof subscription === 'function'
      ? subscription
      : subscription && typeof subscription.unsubscribe === 'function'
        ? () => subscription.unsubscribe()
        : null;
    if (unsubscribe) onCleanup(unsubscribe);
    return subscription;
  }

  function timeout(callback, delay) {
    let unregister = function () {};
    let timer = setTimeout(() => {
      timer = null;
      unregister();
      if (active) callback();
    }, delay);
    unregister = onCleanup(() => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    });
    return timer;
  }

  function interval(callback, delay) {
    const timer = setInterval(() => {
      if (active) callback();
    }, delay);
    onCleanup(() => clearInterval(timer));
    return timer;
  }

  function animationFrame(callback) {
    let unregister = function () {};
    let frame = requestAnimationFrame(() => {
      frame = null;
      unregister();
      if (active) callback();
    });
    unregister = onCleanup(() => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    });
    return frame;
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
    listen,
    trackObserver,
    disconnectObserver,
    trackSubscription,
    timeout,
    interval,
    animationFrame,
  };
}

module.exports = { createLegacyPageLifecycle };
