import React, { useEffect, useRef, useState } from 'react';
import { Check, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { createEmptyOtpCode, createSubmissionGate } from '../../public/js/auth-flow-utils';
import { OtpCodeInput, OtpCodeInputHandle } from './OtpCodeInput';

type RecoveryStep = 'email' | 'otp' | 'password' | 'success';
type RecoveryAlert = { type: 'error' | 'success'; message: string };

interface PasswordRecoveryProps {
  initialStep: 'email' | 'password';
  onSwitchToLogin: () => void;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PasswordRecovery: React.FC<PasswordRecoveryProps> = ({ initialStep, onSwitchToLogin }) => {
  const [step, setStep] = useState<RecoveryStep>(initialStep);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(createEmptyOtpCode());
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [alert, setAlert] = useState<RecoveryAlert | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingRecovery, setIsCheckingRecovery] = useState(initialStep === 'password');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [animation, setAnimation] = useState<'idle' | 'exit' | 'enter'>('idle');
  const transitionTimer = useRef<number | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<OtpCodeInputHandle>(null);
  const verificationGate = useRef(createSubmissionGate()).current;

  useEffect(() => {
    if (initialStep !== 'password') return;
    let active = true;
    const verifyRecoverySession = async () => {
      try {
        const client = (window as any).supabaseClient;
        if (!client) throw new Error('Authentication is unavailable right now. Please try again.');
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          if (!active) return;
          setStep('email');
          setAlert({ type: 'error', message: 'Your password reset session has expired. Please request a new verification code.' });
        } else if (active) {
          setAlert({ type: 'success', message: 'Email verified. Enter your new password below.' });
        }
      } catch (error: any) {
        if (!active) return;
        setStep('email');
        setAlert({ type: 'error', message: error?.message || 'Could not verify your password reset session. Please request a new verification code.' });
      } finally {
        if (active) setIsCheckingRecovery(false);
      }
    };
    verifyRecoverySession();
    return () => {
      active = false;
    };
  }, [initialStep]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  const clearAlert = () => setAlert(null);

  const changeStep = (nextStep: RecoveryStep) => {
    if (nextStep === step || animation !== 'idle') return;
    setAnimation('exit');
    transitionTimer.current = window.setTimeout(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setStep(nextStep);
      setAnimation('enter');
      window.requestAnimationFrame(() => {
        if (nextStep === 'email') emailInputRef.current?.focus({ preventScroll: true });
        if (nextStep === 'otp') otpInputRef.current?.focusFirst();
        if (nextStep === 'password') passwordInputRef.current?.focus({ preventScroll: true });
      });
      transitionTimer.current = window.setTimeout(() => setAnimation('idle'), 180);
    }, 140);
  };

  const sendCode = async (targetEmail: string) => {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not send the verification code. Please try again in a few moments.');
  };

  const handleSendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearAlert();
    const normalizedEmail = email.trim();
    if (!emailPattern.test(normalizedEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    setIsLoading(true);
    try {
      await sendCode(normalizedEmail);
      setEmail(normalizedEmail);
      setCode(createEmptyOtpCode());
      setFailedAttempts(0);
      setResendSeconds(60);
      changeStep('otp');
      setAlert({ type: 'success', message: "If an account exists for this email, we've sent you a verification code." });
    } catch (error: any) {
      setAlert({ type: 'error', message: error?.message || 'Could not send verification code. Please try again in a few moments.' });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (token: string) => verificationGate.run(async () => {
    clearAlert();
    if (token.length !== 6) {
      setAlert({ type: 'error', message: 'Please enter the complete 6-digit verification code.' });
      otpInputRef.current?.focusFirst();
      return;
    }
    if (failedAttempts >= 5) {
      setAlert({ type: 'error', message: 'Too many failed attempts. Please request a new verification code.' });
      return;
    }
    const client = (window as any).supabaseClient;
    if (!client) {
      setAlert({ type: 'error', message: 'Authentication is unavailable right now. Please try again.' });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await client.auth.verifyOtp({ email, token, type: 'recovery' });
      if (error) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        otpInputRef.current?.clearAndFocus();
        if (/expired/i.test(error.message || '')) {
          setAlert({ type: 'error', message: 'This verification code has expired. Please click "Resend code" to get a fresh one.' });
        } else if (/invalid|token/i.test(error.message || '')) {
          const remaining = 5 - nextAttempts;
          setAlert({
            type: 'error',
            message: remaining > 0
              ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
              : 'Too many failed attempts. Please request a new verification code.',
          });
        } else {
          setAlert({ type: 'error', message: `Verification failed: ${error.message || 'Please try again.'}` });
        }
        return;
      }
      setPassword('');
      setConfirmPassword('');
      changeStep('password');
      setAlert({ type: 'success', message: 'Email verified. Now create your new password.' });
    } catch (error: any) {
      otpInputRef.current?.clearAndFocus();
      setAlert({ type: 'error', message: error?.message || 'Could not verify code. Please check your connection and try again.' });
    } finally {
      setIsLoading(false);
    }
  });

  const handleVerifyCode = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void verifyCode(code.join(''));
  };

  const handleResendCode = async () => {
    if (resendSeconds > 0 || isLoading) return;
    clearAlert();
    otpInputRef.current?.clearAndFocus();
    setCode(createEmptyOtpCode());
    setIsLoading(true);
    try {
      await sendCode(email);
      setFailedAttempts(0);
      setResendSeconds(60);
      setAlert({ type: 'success', message: "If an account exists for this email, we've sent you a verification code." });
    } catch (error: any) {
      setAlert({ type: 'error', message: error?.message || 'Could not resend the verification code. Please try again.' });
    } finally {
      setIsLoading(false);
      window.requestAnimationFrame(() => otpInputRef.current?.focusFirst());
    }
  };

  const handleChangeEmail = () => {
    setCode(createEmptyOtpCode());
    setFailedAttempts(0);
    setResendSeconds(0);
    clearAlert();
    changeStep('email');
  };

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearAlert();
    const nextPasswordError = password.length < 8 ? 'Password must be at least 8 characters' : '';
    const nextConfirmError = !confirmPassword || password !== confirmPassword ? 'Passwords do not match' : '';
    setPasswordError(nextPasswordError);
    setConfirmPasswordError(nextConfirmError);
    if (nextPasswordError || nextConfirmError) return;

    const client = (window as any).supabaseClient;
    if (!client) {
      setAlert({ type: 'error', message: 'Authentication is unavailable right now. Please try again.' });
      return;
    }
    setIsLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        setAlert({ type: 'error', message: 'Your password reset session has expired. Please request a new verification code.' });
        changeStep('email');
        return;
      }
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmPassword('');
      setCode(createEmptyOtpCode());
      setEmail('');
      setAlert(null);
      changeStep('success');
    } catch (error: any) {
      setAlert({ type: 'error', message: error?.message || 'Could not update password. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReturnToLogin = () => {
    setStep('email');
    setEmail('');
    setCode(createEmptyOtpCode());
    setPassword('');
    setConfirmPassword('');
    setAlert(null);
    setResendSeconds(0);
    setFailedAttempts(0);
    onSwitchToLogin();
  };

  const passwordMeetsLength = password.length >= 8;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  if (isCheckingRecovery) {
    return (
      <div className="flex min-h-[240px] items-center justify-center" role="status" aria-label="Checking password reset session">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#f5efe7]" />
      </div>
    );
  }

  return (
    <div className={`w-full recovery-content recovery-content-${animation}`}>
      {step !== 'success' && (
        <div className="mb-8">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#d9d1c6]/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#d6ddd2]">
            <Lock size={12} />
            {step === 'email' ? 'PASSWORD RECOVERY' : step === 'otp' ? 'Step 2 of 3' : 'Step 3 of 3'}
          </p>
          <h2 id="auth-panel-recovery-title" className="text-3xl font-semibold tracking-[-0.04em] text-[#f4efe9]">
            {step === 'email' ? 'Forgot your password?' : step === 'otp' ? 'Enter 6-digit code' : 'Create a new password'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#d9d2c9]/80">
            {step === 'email' && "Enter the email address associated with your VaRoom account and we'll send you a verification code."}
            {step === 'otp' && <>We sent a verification code to <strong className="font-semibold text-[#f5efe7]">{email}</strong>.</>}
            {step === 'password' && 'Choose a strong password for your VaRoom account.'}
          </p>
        </div>
      )}

      {alert && (
        <div
          className={`mb-5 rounded-xl border px-3 py-2 text-sm ${
            alert.type === 'error'
              ? 'border-[#efb6ae]/30 bg-[#7d2a22]/30 text-[#f9d3ce]'
              : 'border-[#7ac7a3]/30 bg-[#1d4737]/40 text-[#d7f7e6]'
          }`}
          role={alert.type === 'error' ? 'alert' : 'status'}
        >
          {alert.message}
        </div>
      )}

      {step === 'email' && (
        <>
          <form className="space-y-4" onSubmit={handleSendCode} noValidate>
            <div>
              <label htmlFor="recovery-email" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#d7d2ca]/70" />
                <input
                  ref={emailInputRef}
                  id="recovery-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailError) setEmailError('');
                  }}
                  onBlur={() => setEmailError(email && !emailPattern.test(email.trim()) ? 'Please enter a valid email address' : '')}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={`auth-control h-14 w-full rounded-2xl border bg-[#f5efe8]/8 py-0 pl-10 pr-3 text-sm leading-5 text-[#f5efe8] placeholder:text-[#d3c7ba]/55 outline-none transition ${emailError ? 'border-[#efb6ae]' : 'border-white/10 focus:border-[#dde3d6]/45'}`}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? 'recovery-email-error' : undefined}
                />
              </div>
              {emailError && <p id="recovery-email-error" className="mt-1 text-xs text-[#f3c0b6]">{emailError}</p>}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#111111] px-4 py-3 text-sm font-semibold text-[#f7f3ee] transition-colors duration-200 hover:bg-[#292827] disabled:cursor-not-allowed disabled:opacity-80"
            >
              {isLoading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Sending code...</> : 'Send OTP'}
            </button>
          </form>
          <p className="mt-5 text-xs leading-5 text-[#d9d2c9]/65">
            We protect your security. Codes can be resent after 60 seconds and can only be used once.
          </p>
          <p className="mt-5 text-center text-sm text-[#e2d9d1]/80">
            Remember your password?{' '}
            <button type="button" onClick={onSwitchToLogin} className="border-0 bg-transparent p-0 font-semibold text-white underline-offset-4 hover:underline">
              Log in
            </button>
          </p>
        </>
      )}

      {step === 'otp' && (
        <>
          <form className="space-y-5" onSubmit={handleVerifyCode} noValidate>
            <div>
              <OtpCodeInput
                ref={otpInputRef}
                idPrefix="recovery-code"
                value={code}
                onChange={(nextCode) => {
                  setCode(nextCode);
                  clearAlert();
                }}
                onComplete={(token) => { void verifyCode(token); }}
                disabled={isLoading || failedAttempts >= 5}
              />
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#d9d2c9]/65">
                <span>Didn't receive it? Check spam</span>
                <button type="button" onClick={handleChangeEmail} className="border-0 bg-transparent p-0 text-xs font-medium text-[#f0e7df] hover:underline">
                  Change email
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading || failedAttempts >= 5}
              className="flex h-12 w-full items-center justify-center rounded-lg border border-white/10 bg-[#111111] px-4 text-sm font-semibold text-[#f7f3ee] transition-colors hover:bg-[#292827] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? 'Verifying...' : 'Continue'}
            </button>
          </form>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resendSeconds > 0 || isLoading}
            className="mt-4 w-full border-0 bg-transparent p-0 text-center text-sm font-medium text-[#f0e7df] hover:underline disabled:cursor-default disabled:text-[#d9d2c9]/55"
          >
            {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
          </button>
          <p className="mt-5 text-center text-sm text-[#e2d9d1]/80">
            <button type="button" onClick={onSwitchToLogin} className="border-0 bg-transparent p-0 font-semibold text-white underline-offset-4 hover:underline">
              Cancel and return to Log in
            </button>
          </p>
        </>
      )}

      {step === 'password' && (
        <form className="space-y-4" onSubmit={handleUpdatePassword} noValidate>
          <div>
            <label htmlFor="recovery-new-password" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">
              New password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#d7d2ca]/70" />
              <input
                ref={passwordInputRef}
                id="recovery-new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (passwordError) setPasswordError('');
                }}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className={`auth-control auth-control--trailing-icon h-14 w-full rounded-2xl border bg-[#f5efe8]/8 py-0 pl-10 pr-10 text-sm leading-5 text-[#f5efe7] placeholder:text-[#d3c7ba]/55 outline-none transition ${passwordError ? 'border-[#efb6ae]' : 'border-white/10 focus:border-[#dde3d6]/45'}`}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'recovery-password-error' : undefined}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#d7d2ca] transition-colors hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordError && <p id="recovery-password-error" className="mt-1 text-xs text-[#f3c0b6]">{passwordError}</p>}
          </div>

          <div>
            <label htmlFor="recovery-confirm-password" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">
              Confirm new password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#d7d2ca]/70" />
              <input
                id="recovery-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (confirmPasswordError) setConfirmPasswordError('');
                }}
                autoComplete="new-password"
                placeholder="Confirm your new password"
                className={`auth-control auth-control--trailing-icon h-14 w-full rounded-2xl border bg-[#f5efe8]/8 py-0 pl-10 pr-10 text-sm leading-5 text-[#f5efe7] placeholder:text-[#d3c7ba]/55 outline-none transition ${confirmPasswordError ? 'border-[#efb6ae]' : 'border-white/10 focus:border-[#dde3d6]/45'}`}
                aria-invalid={Boolean(confirmPasswordError)}
                aria-describedby={confirmPasswordError ? 'recovery-confirm-password-error' : undefined}
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowConfirmPassword((visible) => !visible)}
                className="absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#d7d2ca] transition-colors hover:text-white"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPasswordError && <p id="recovery-confirm-password-error" className="mt-1 text-xs text-[#f3c0b6]">{confirmPasswordError}</p>}
          </div>

          <div className="space-y-2 text-xs text-[#d9d2c9]/70">
            <p className={`flex items-center gap-2 ${passwordMeetsLength ? 'text-[#b6e1c8]' : ''}`}>
              <Check size={14} aria-hidden="true" /> At least 8 characters long
            </p>
            <p className={`flex items-center gap-2 ${passwordsMatch ? 'text-[#b6e1c8]' : ''}`}>
              <Check size={14} aria-hidden="true" /> Both passwords match
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#111111] px-4 py-3 text-sm font-semibold text-[#f7f3ee] transition-colors duration-200 hover:bg-[#292827] disabled:cursor-not-allowed disabled:opacity-80"
          >
            {isLoading ? 'Updating password...' : 'Update password'}
          </button>
          <p className="text-center text-sm text-[#e2d9d1]/80">
            <button type="button" onClick={onSwitchToLogin} className="border-0 bg-transparent p-0 font-semibold text-white underline-offset-4 hover:underline">
              Cancel
            </button>
          </p>
        </form>
      )}

      {step === 'success' && (
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-[#7ac7a3]/30 bg-[#1d4737]/40 text-[#b6e1c8]" aria-hidden="true">
            <Check size={26} strokeWidth={2.5} />
          </div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#d9d1c6]/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#d6ddd2]">
            Authenticated
          </p>
          <h2 id="auth-panel-recovery-title" className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#f4efe9]">
            Password updated successfully.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#d9d2c9]/80">
            You can now log in with your new password.
          </p>
          <button
            type="button"
            onClick={handleReturnToLogin}
            className="mt-7 flex w-full items-center justify-center rounded-lg border border-white/10 bg-[#111111] px-4 py-3 text-sm font-semibold text-[#f7f3ee] transition-colors duration-200 hover:bg-[#292827]"
          >
            Return to Login
          </button>
        </div>
      )}
      <style jsx>{`
        .recovery-content-exit {
          animation: recovery-content-exit 140ms ease-in both;
        }
        .recovery-content-enter {
          animation: recovery-content-enter 180ms ease-out both;
        }
        @keyframes recovery-content-exit {
          to { opacity: 0; transform: translateX(-16px); }
        }
        @keyframes recovery-content-enter {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .recovery-content-exit,
          .recovery-content-enter {
            animation-duration: 1ms;
          }
        }
      `}</style>
    </div>
  );
};
