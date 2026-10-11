(function (root, factory) {
  var utils = factory();
  if (typeof module === 'object' && module.exports) module.exports = utils;
  if (root) root.VaRoomAuthFlowUtils = utils;
})(typeof window !== 'undefined' ? window : null, function () {
  function normalizeSignupRole(role) {
    return role === 'host' ? 'host' : 'client';
  }

  function normalizeUsername(value) {
    return String(value || '').toLowerCase();
  }

  function createEmptyOtpCode() {
    return ['', '', '', '', '', ''];
  }

  function applyOtpInput(current, index, value) {
    var digits = String(value || '').replace(/\D/g, '').slice(0, 6);
    var next = current.slice(0, 6);
    while (next.length < 6) next.push('');

    if (digits.length > 1) {
      next = createEmptyOtpCode();
      digits.split('').forEach(function (digit, digitIndex) {
        next[digitIndex] = digit;
      });
      return next;
    }

    next[index] = digits.slice(-1);
    return next;
  }

  function isCompleteOtpCode(code) {
    return code.length === 6 && code.every(function (digit) {
      return /^\d$/.test(digit);
    });
  }

  function notifyOtpCompletion(code, onComplete) {
    if (!isCompleteOtpCode(code)) return;
    onComplete(code.join(''));
  }

  function clearOtpCode(onChange, focusFirst) {
    onChange(createEmptyOtpCode());
    focusFirst();
  }

  function createSubmissionGate() {
    var inFlight = false;
    return {
      run: async function (operation) {
        if (inFlight) return false;
        inFlight = true;
        try {
          await operation();
          return true;
        } finally {
          inFlight = false;
        }
      }
    };
  }

  return {
    accountTypeDescriptions: {
      client: 'Explore spaces in VaRoom.',
      host: 'List spaces in VaRoom.'
    },
    normalizeSignupRole: normalizeSignupRole,
    normalizeUsername: normalizeUsername,
    createEmptyOtpCode: createEmptyOtpCode,
    applyOtpInput: applyOtpInput,
    isCompleteOtpCode: isCompleteOtpCode,
    notifyOtpCompletion: notifyOtpCompletion,
    clearOtpCode: clearOtpCode,
    createSubmissionGate: createSubmissionGate
  };
});
