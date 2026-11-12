import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { accountTypeDescriptions, createEmptyOtpCode, createSubmissionGate } from '../../lib/auth/authFlow';
import { OtpCodeInput } from './OtpCodeInput';
import type { OtpCodeInputHandle } from './OtpCodeInput';
import { GoogleLogo, GoogleSignInButton } from './GoogleSignInButton';
import { errorMessage } from '../../lib/errors';

type AccountRole = 'host' | 'client';
// start: pick Google or email · role: pick the account type · details: the email form.
type SignupStep = 'start' | 'role' | 'details';
type PasswordCriteria = {
  length: boolean;
  uppercase: boolean;
  numberOrSpecial: boolean;
};

interface SignupFormProps {
  redirect: string;
  initialRole: AccountRole;
  active: boolean;
  onSwitchToLogin: () => void;
  /** The account type once it has been asked for, so the panel's side copy can follow it. */
  onRoleShown?: (role: AccountRole | null) => void;
}

const passwordCriteria = (password: string): PasswordCriteria => ({
  length: password.length >= 8,
  uppercase: /[A-Z]/.test(password),
  numberOrSpecial: /[0-9]|[^A-Za-z0-9]/.test(password),
});

const heading: Record<SignupStep, string> = {
  start: 'Create your account.',
  role: 'How will you use VaRoom?',
  details: 'Your details.',
};
const subheading: Record<Exclude<SignupStep, 'details'>, string> = {
  start: 'Join VaRoom in under a minute.',
  role: 'Choose the account that fits you.',
};
const choiceButton = 'flex h-12 w-full max-w-[400px] items-center justify-center gap-3 rounded-md border border-[#111111] bg-[#111111] px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70';
const consent = (
  <p className="mt-5 text-center text-xs leading-relaxed text-[#d9d2c9]/70">
    By continuing you agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#f5efe7] underline underline-offset-2">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#f5efe7] underline underline-offset-2">Privacy Policy</a>.
  </p>
);

const isStrongPassword = (password: string) => {
  const criteria = passwordCriteria(password);
  return criteria.length && criteria.uppercase && criteria.numberOrSpecial;
};

export const SignupForm: React.FC<SignupFormProps> = ({ redirect, initialRole, active, onSwitchToLogin, onRoleShown }) => {
  const [step, setStep] = useState<SignupStep>('start');
  const [method, setMethod] = useState<'google' | 'email'>('email');
  const [role, setRole] = useState<AccountRole>(initialRole);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState(createEmptyOtpCode());
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const otpInputRef = useRef<OtpCodeInputHandle>(null);
  const verificationGate = useRef(createSubmissionGate()).current;

  const criteria = passwordCriteria(password);
  const passwordIsStrong = isStrongPassword(password);
  const canSubmit = passwordIsStrong && !isLoading;
  const googleClient = typeof window === 'undefined'
    ? null
    : (window as Window & { supabaseClient?: SupabaseClient }).supabaseClient || null;

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);

  useEffect(() => {
    onRoleShown?.(step === 'start' ? null : role);
  }, [step, role, onRoleShown]);

  // Each step starts with focus on its first control.
  useEffect(() => {
    if (!active || step === 'start') return;
    const id = step === 'role' ? `signup-role-${role}` : 'signup-fullname';
    window.requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
    // Only when the step changes, not on every role click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, active]);

  const chooseMethod = (next: 'google' | 'email') => {
    setAlert('');
    setMethod(next);
    setStep('role');
  };

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
    if (fieldErrors.password) setFieldError('password', '');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert('');

    const nextErrors = {
      fullName: fullName.trim().length < 2 ? 'Please enter your full name' : '',
      email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Please enter a valid email address' : '',
      password: !passwordIsStrong ? 'Password must be at least 8 characters' : '',
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const client = window.supabaseClient;
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
      setVerificationCode(createEmptyOtpCode());
      setIsVerifying(true);
    } catch (error) {
      setAlert(errorMessage(error) || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (code: string) => verificationGate.run(async () => {
    if (code.length !== 6) {
      setAlert('Enter the complete 6-digit verification code.');
      return;
    }

    const client = window.supabaseClient;
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
        otpInputRef.current?.clearAndFocus();
        return;
      }
      window.location.assign(`/auth-callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`);
    } catch (error) {
      setAlert(errorMessage(error) || 'That code is invalid or expired. Please try again.');
      otpInputRef.current?.clearAndFocus();
    } finally {
      setIsLoading(false);
    }
  });

  const handleVerify = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void verifyCode(verificationCode.join(''));
  };

  const handleResendCode = async () => {
    if (isLoading) return;
    setAlert('');
    otpInputRef.current?.clearAndFocus();
    setVerificationCode(createEmptyOtpCode());
    setIsLoading(true);
    setResendSeconds(60);
    try {
      const response = await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setAlert(result.error || 'Could not resend the verification code.');
    } catch (error) {
      setAlert(errorMessage(error) || 'Could not resend the verification code.');
    } finally {
      setIsLoading(false);
      window.requestAnimationFrame(() => otpInputRef.current?.focusFirst());
    }
  };

  return (
    <div className="w-full">
      <div className="mb-7">
        {!isVerifying && step !== 'start' && (
          <button
            type="button"
            onClick={() => { setAlert(''); setStep(step === 'details' ? 'role' : 'start'); }}
            className="mb-4 inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-[#e2d9d1]/80 hover:text-white"
          >
            <ArrowLeft size={15} /> Back
          </button>
        )}
        <h2 id="auth-panel-signup-title" className="text-3xl font-semibold tracking-[-0.04em] text-[#f4efe9]">
          {isVerifying ? 'Verify your email.' : heading[step]}
        </h2>
        <p className="mt-2 text-sm text-[#d9d2c9]/80">
          {isVerifying ? 'Enter the 6-digit code we sent to your email.' : step === 'details' ? `Creating a ${role} account.` : subheading[step]}
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
            <OtpCodeInput
              ref={otpInputRef}
              idPrefix="signup-code"
              value={verificationCode}
              onChange={setVerificationCode}
              onComplete={(token) => { void verifyCode(token); }}
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading} className="va-button va-button-primary flex h-12 w-full items-center justify-center px-4 text-sm font-semibold">
              {isLoading ? 'Verifying...' : 'Continue'}
            </button>
          </form>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resendSeconds > 0 || isLoading}
            className="mt-4 w-full border-0 bg-transparent p-0 text-center text-sm font-medium text-[#f0e7df] hover:underline disabled:cursor-default disabled:text-[#d9d2c9]/55"
          >
            {resendSeconds > 0 ? `Code sent — try again in ${resendSeconds}s` : 'Resend code'}
          </button>
        </div>
      ) : step === 'start' ? (
        <>
          <div className="flex flex-col items-center gap-3">
            <button id="signup-continue-google" type="button" onClick={() => chooseMethod('google')} className={choiceButton}>
              <GoogleLogo /> Continue with Google
            </button>
            <button type="button" onClick={() => chooseMethod('email')} className={`${choiceButton} !border-white/20 !bg-transparent hover:!bg-white/5`}>
              <Mail size={18} /> Continue with email
            </button>
          </div>
          {consent}
          <p className="mt-8 text-center text-sm text-[#e2d9d1]/80">
            Already have an account?{' '}
            <button type="button" onClick={onSwitchToLogin} className="border-0 bg-transparent p-0 font-semibold text-white underline-offset-4 hover:underline">
              Log in
            </button>
          </p>
        </>
      ) : step === 'role' ? (
        <>
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Account type">
            {(['client', 'host'] as const).map((option) => (
              <button
                key={option}
                id={`signup-role-${option}`}
                type="button"
                aria-pressed={role === option}
                aria-describedby={`signup-role-${option}-description`}
                onClick={() => setRole(option)}
                className={`min-h-[68px] rounded-xl border px-4 py-4 text-left text-base font-semibold capitalize transition-colors ${
                  role === option
                    ? 'border-[#f5efe7] bg-[#f5efe7] text-[#151310]'
                    : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                <span className="block">{option}</span>
                <span id={`signup-role-${option}-description`} className={`account-type-description mt-1 block min-h-[1.25rem] text-xs font-normal normal-case leading-snug ${role === option ? 'text-[#151310]/70' : 'text-[#d9d2c9]/75'}`}>
                  {accountTypeDescriptions[option]}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-6">
            {method === 'google' ? (
              <GoogleSignInButton
                active={active && !isVerifying}
                client={googleClient}
                redirectTo={`${typeof window === 'undefined' ? '' : window.location.origin}/auth-callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
                intendedRole={role}
                text="continue_with"
              />
            ) : (
              <button type="button" onClick={() => setStep('details')} className="va-button va-button-primary flex h-12 w-full items-center justify-center px-4 text-sm font-semibold">
                Continue
              </button>
            )}
          </div>
        </>
      ) : (
        <>
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
              <div id="signup-password-requirements" className="mt-2 space-y-1 text-xs text-[#d9d2c9]/65" aria-live="polite" hidden={!password || passwordIsStrong}>
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

            <button type="submit" disabled={!canSubmit} className="va-button va-button-primary flex h-12 w-full items-center justify-center gap-2 px-4 text-sm font-semibold disabled:cursor-not-allowed">
              {isLoading ? 'Creating account...' : `Create ${role} account`}
            </button>
          </form>

          {consent}
        </>
      )}
    </div>
  );
};
