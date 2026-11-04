// Sign-up and code-entry helpers for the landing auth panel (moved from
// public/js/auth-flow-utils.js, unchanged behaviour).

export type SignupRole = 'host' | 'client';
export type OtpCode = string[];

export const accountTypeDescriptions: Record<SignupRole, string> = {
  client: 'Explore spaces in VaRoom.',
  host: 'List spaces in VaRoom.',
};

export const normalizeSignupRole = (role: unknown): SignupRole => (role === 'host' ? 'host' : 'client');

export const normalizeUsername = (value: unknown): string => String(value || '').toLowerCase();

export const createEmptyOtpCode = (): OtpCode => ['', '', '', '', '', ''];

/** One typed digit, or a pasted / autofilled code filling every box. */
export function applyOtpInput(current: OtpCode, index: number, value: unknown): OtpCode {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6);
  if (digits.length > 1) {
    const next = createEmptyOtpCode();
    digits.split('').forEach((digit, digitIndex) => { next[digitIndex] = digit; });
    return next;
  }
  const next = current.slice(0, 6);
  while (next.length < 6) next.push('');
  next[index] = digits.slice(-1);
  return next;
}

export const isCompleteOtpCode = (code: OtpCode): boolean => code.length === 6 && code.every((digit) => /^\d$/.test(digit));

export function notifyOtpCompletion(code: OtpCode, onComplete: (code: string) => void): void {
  if (isCompleteOtpCode(code)) onComplete(code.join(''));
}

export function clearOtpCode(onChange: (code: OtpCode) => void, focusFirst: () => void): void {
  onChange(createEmptyOtpCode());
  focusFirst();
}

/** Runs one operation at a time; a second call while one is running returns false. */
export function createSubmissionGate(): { run: (operation: () => Promise<unknown> | unknown) => Promise<boolean> } {
  let inFlight = false;
  return {
    async run(operation) {
      if (inFlight) return false;
      inFlight = true;
      try {
        await operation();
        return true;
      } finally {
        inFlight = false;
      }
    },
  };
}
