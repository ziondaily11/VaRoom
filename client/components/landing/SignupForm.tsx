import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';

type AccountRole = 'host' | 'client';
type PasswordCriteria = {
  length: boolean;
  uppercase: boolean;
  numberOrSpecial: boolean;
};

interface SignupFormProps {
  redirect: string;
  initialRole: AccountRole;
  onSwitchToLogin: () => void;
}

const passwordCriteria = (password: string): PasswordCriteria => ({
  length: password.length >= 8,
  uppercase: /[A-Z]/.test(password),
  numberOrSpecial: /[0-9]|[^A-Za-z0-9]/.test(password),
});

const isStrongPassword = (password: string) => {
  const criteria = passwordCriteria(password);
  return criteria.length && criteria.uppercase && criteria.numberOrSpecial;
};

export const SignupForm: React.FC<SignupFormProps> = ({ redirect, initialRole, onSwitchToLogin }) => {
  const [role, setRole] = useState<AccountRole>(initialRole);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  const criteria = passwordCriteria(password);
  const passwordIsStrong = isStrongPassword(password);
  const canSubmit = passwordIsStrong && password === confirmPassword && agreed && !isLoading;

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const setFieldError = (field: string, message: string) => {
    setFieldErrors((current) => ({ ...current, [field]: message }));
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (!isStrongPassword(value)) setConfirmPassword('');
    if (fieldErrors.password) setFieldError('password', '');
  };

  const handleSignupWithGoogle = async () => {
    setAlert('');
    const client = (window as any).supabaseClient;
    if (!client) {
      setAlert('Google authentication is unavailable right now.');
      return;
    }

    try {
      window.sessionStorage.setItem('varoom_intended_role', role);
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth-callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`,
        },
      });
      if (error) setAlert(error.message || 'Could not connect to Google. Please try again.');
    } catch (error: any) {
      setAlert(error?.message || 'Could not connect to Google. Please try again.');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert('');

    const nextErrors = {
      fullName: fullName.trim().length < 2 ? 'Please enter your full name' : '',
      email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Please enter a valid email address' : '',
      password: !passwordIsStrong ? 'Password must be at least 8 characters' : '',
      confirmPassword: password !== confirmPassword ? 'Passwords do not match' : '',
    };
    setFieldErrors(nextErrors);

    if (!agreed) setAlert('Please agree to the Privacy Policy and Terms of Service.');
    if (Object.values(nextErrors).some(Boolean) || !agreed) return;

    const client = (window as any).supabaseClient;
    if (!client) {
      setAlert('Authentication is unavailable right now. Please try again.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          role,
          redirect: redirect || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (String(result.error || '').includes('already registered')) {
          setAlert('An account with this email already exists.');
        } else {
          setAlert(result.error || 'Could not create your account.');
        }
        return;
      }

      window.sessionStorage.setItem('varoom_intended_role', role);
      setVerificationEmail(email.trim());
      setVerificationCode(['', '', '', '', '', '']);
      setIsVerifying(true);
    } catch (error: any) {
      setAlert(error?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = verificationCode.join('');
    if (code.length !== 6) {
      setAlert('Enter the complete 6-digit verification code.');
      return;
    }

    const client = (window as any).supabaseClient;
    if (!client) {
      setAlert('Authentication is unavailable right now. Please try again.');
      return;
    }

    setAlert('');
    setIsLoading(true);
    try {
      const { error } = await client.auth.verifyOtp({
        email: verificationEmail,
        token: code,
        type: 'signup',
      });
      if (error) {
        setAlert(error.message || 'That code is invalid or expired. Please try again.');
        return;
      }
      window.location.assign(`/auth-callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`);
    } catch (error: any) {
      setAlert(error?.message || 'That code is invalid or expired. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setAlert('');
    setResendSeconds(60);
    try {
      const response = await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setAlert(result.error || 'Could not resend the verification code.');
    } catch (error: any) {
      setAlert(error?.message || 'Could not resend the verification code.');
    }
  };

  const updateVerificationDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setVerificationCode((current) => current.map((currentDigit, currentIndex) => currentIndex === index ? digit : currentDigit));
    if (digit && index < 5) document.getElementById(`signup-code-${index + 1}`)?.focus();
  };

  const handleVerificationKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !verificationCode[index] && index > 0) {
      document.getElementById(`signup-code-${index - 1}`)?.focus();
    }
  };

  const handleVerificationPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    setVerificationCode(digits.concat(['', '', '', '', '', '']).slice(0, 6));
    document.getElementById(`signup-code-${Math.min(digits.length, 5)}`)?.focus();
  };

  return (
    <div className="w-full">
      <div className="mb-7">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#d9d1c6]/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#d6ddd2]">
          <Lock size={12} />
          Secure access
        </p>
        <h2 id="auth-panel-signup-title" className="text-3xl font-semibold tracking-[-0.04em] text-[#f4efe9]">
          {isVerifying ? 'Verify your email.' : 'Create your VaRoom account.'}
        </h2>
        <p className="mt-2 text-sm text-[#d9d2c9]/80">
          {isVerifying ? 'Enter the 6-digit code we sent to your email.' : 'Set up your account and start exploring VaRoom.'}
        </p>
      </div>

      {alert && (
        <div className="mb-5 rounded-xl border border-[#efb6ae]/30 bg-[#7d2a22]/30 px-3 py-2 text-sm text-[#f9d3ce]" role="alert">
          {alert}{' '}
          {alert === 'An account with this email already exists.' && (
            <button type="button" onClick={onSwitchToLogin} className="border-0 bg-transparent p-0 font-semibold text-white underline">
              Log in instead
            </button>
          )}
        </div>
      )}

      {isVerifying ? (
        <div>
          <p className="mb-5 text-sm text-[#d9d2c9]/80">
            We sent a verification code to <strong className="text-[#f5efe7]">{verificationEmail}</strong>
          </p>
          <form className="space-y-5" onSubmit={handleVerify} noValidate>
            <div className="grid grid-cols-6 gap-2" aria-label="Six-digit verification code">
              {verificationCode.map((digit, index) => (
                <input
                  key={index}
                  id={`signup-code-${index}`}
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : undefined}
                  maxLength={1}
                  aria-label={`Digit ${index + 1}`}
                  value={digit}
                  onChange={(event) => updateVerificationDigit(index, event.target.value)}
                  onKeyDown={(event) => handleVerificationKeyDown(index, event)}
                  onPaste={handleVerificationPaste}
                  className="h-12 min-w-0 rounded-lg border border-white/10 bg-white/5 text-center text-lg text-[#f5efe7] outline-none focus:border-white/40"
                />
              ))}
            </div>
            <button type="submit" disabled={isLoading} className="flex h-12 w-full items-center justify-center rounded-lg border border-white/10 bg-[#111111] px-4 text-sm font-semibold text-[#f7f3ee] transition-colors hover:bg-[#292827] disabled:opacity-70">
              {isLoading ? 'Verifying...' : 'Continue'}
            </button>
          </form>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resendSeconds > 0}
            className="mt-4 w-full border-0 bg-transparent p-0 text-center text-sm font-medium text-[#f0e7df] hover:underline disabled:cursor-default disabled:text-[#d9d2c9]/55"
          >
            {resendSeconds > 0 ? `Code sent — try again in ${resendSeconds}s` : 'Resend code'}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <p className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">Account type</p>
            <div className="grid grid-cols-2 gap-2">
              {(['client', 'host'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={role === option}
                  onClick={() => setRole(option)}
                  className={`h-11 rounded-lg border px-3 text-sm font-medium capitalize transition-colors ${
                    role === option
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/10 bg-transparent text-[#d9d2c9]/75 hover:bg-white/5'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignupWithGoogle}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-[#f6f0ea] transition-colors hover:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>
          <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#d7d2ca]/65">
            <span className="h-px flex-1 bg-white/10" />
            <span>or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="signup-fullname" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">Full name</label>
              <div className="relative">
                <User className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#d7d2ca]/70" />
                <input
                  id="signup-fullname"
                  type="text"
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.target.value);
                    if (fieldErrors.fullName) setFieldError('fullName', '');
                  }}
                  autoComplete="name"
                  placeholder="Full name"
                  className={`auth-control h-14 w-full rounded-2xl border bg-[#f5efe8]/8 py-0 pl-10 pr-3 text-sm leading-5 text-[#f5efe8] placeholder:text-[#d3c7ba]/55 outline-none transition ${fieldErrors.fullName ? 'border-[#efb6ae]' : 'border-white/10 focus:border-[#dde3d6]/45'}`}
                  aria-invalid={Boolean(fieldErrors.fullName)}
                />
              </div>
              {fieldErrors.fullName && <p className="mt-1 text-xs text-[#f3c0b6]">{fieldErrors.fullName}</p>}
            </div>

            <div>
              <label htmlFor="signup-email" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">Email address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#d7d2ca]/70" />
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (fieldErrors.email) setFieldError('email', '');
                  }}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={`auth-control h-14 w-full rounded-2xl border bg-[#f5efe8]/8 py-0 pl-10 pr-3 text-sm leading-5 text-[#f5efe8] placeholder:text-[#d3c7ba]/55 outline-none transition ${fieldErrors.email ? 'border-[#efb6ae]' : 'border-white/10 focus:border-[#dde3d6]/45'}`}
                  aria-invalid={Boolean(fieldErrors.email)}
                />
              </div>
              {fieldErrors.email && <p className="mt-1 text-xs text-[#f3c0b6]">{fieldErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="signup-password" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#d7d2ca]/70" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => handlePasswordChange(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Password"
                  aria-describedby="signup-password-requirements"
                  className={`auth-control auth-control--trailing-icon h-14 w-full rounded-2xl border bg-[#f5efe8]/8 py-0 pl-10 pr-12 text-sm leading-5 text-[#f5efe8] placeholder:text-[#d3c7ba]/55 outline-none transition ${fieldErrors.password ? 'border-[#efb6ae]' : 'border-white/10 focus:border-[#dde3d6]/45'}`}
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)} className="absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#d7d2ca] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/60">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && <p className="mt-1 text-xs text-[#f3c0b6]">{fieldErrors.password}</p>}
              <div id="signup-password-requirements" className="mt-2 space-y-1 text-xs text-[#d9d2c9]/65" aria-live="polite">
                {([
                  ['length', 'At least 8 characters'],
                  ['uppercase', 'An uppercase letter'],
                  ['numberOrSpecial', 'A number or special character'],
                ] as const).map(([key, label]) => (
                  <p key={key} className={criteria[key] ? 'text-[#d9e5d8]' : ''}>
                    <span className="mr-2">{criteria[key] ? '✓' : '×'}</span>{label}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="signup-confirm-password" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">Confirm password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#d7d2ca]/70" />
                <input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  disabled={!passwordIsStrong}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    if (fieldErrors.confirmPassword) setFieldError('confirmPassword', '');
                  }}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  className={`auth-control auth-control--trailing-icon h-14 w-full rounded-2xl border bg-[#f5efe8]/8 py-0 pl-10 pr-12 text-sm leading-5 text-[#f5efe7] placeholder:text-[#d3c7ba]/55 outline-none transition disabled:cursor-not-allowed disabled:opacity-50 ${fieldErrors.confirmPassword ? 'border-[#efb6ae]' : 'border-white/10 focus:border-[#dde3d6]/45'}`}
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                />
                <button type="button" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmPassword((current) => !current)} disabled={!passwordIsStrong} className="absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#d7d2ca] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/60 disabled:pointer-events-none">
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.confirmPassword && <p className="mt-1 text-xs text-[#f3c0b6]">{fieldErrors.confirmPassword}</p>}
            </div>

            <label htmlFor="signup-agree" className="auth-consent text-xs text-[#d9d2c9]/80">
              <input
                id="signup-agree"
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="auth-consent-checkbox mt-0.5 h-4 w-4 shrink-0 accent-[#f0e5d9]"
              />
              <span className="auth-consent-copy">I agree to the <a href="/privacy" className="text-[#f5efe7] underline underline-offset-2">Privacy Policy</a> and <a href="/terms" className="text-[#f5efe7] underline underline-offset-2">Terms of Service</a>.</span>
            </label>

            <button type="submit" disabled={!canSubmit} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#111111] px-4 text-sm font-semibold text-[#f7f3ee] transition-colors duration-200 hover:bg-[#292827] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:cursor-not-allowed disabled:opacity-50">
              {isLoading ? 'Creating account...' : `Create ${role} account`}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-[#d9d2c9]/70">
            We&apos;ll send a confirmation email to help you finish setting up.
          </p>
          <p className="mt-5 text-center text-sm text-[#e2d9d1]/80">
            Already have an account?{' '}
            <button type="button" onClick={onSwitchToLogin} className="border-0 bg-transparent p-0 font-semibold text-white underline-offset-4 hover:underline">
              Log in
            </button>
          </p>
        </>
      )}
    </div>
  );
};
