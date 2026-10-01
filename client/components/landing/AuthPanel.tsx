import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, X } from 'lucide-react';
import { useRouter } from 'next/router';
import { SignupForm } from './SignupForm';

interface AuthPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialView: AuthView;
  initialRole: 'host' | 'client';
}

type AuthView = 'login' | 'signup';
type ContentAnimation = 'idle' | 'exit-left' | 'exit-right' | 'enter-left' | 'enter-right';

export const AuthPanel: React.FC<AuthPanelProps> = ({ isOpen, onClose, initialView, initialRole }) => {
  const router = useRouter();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [contentAnimation, setContentAnimation] = useState<ContentAnimation>('idle');
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const transitionTimer = useRef<number | null>(null);
  const transitionLocked = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const redirect = useMemo(() => {
    const candidate = router.query.redirect;
    return typeof candidate === 'string' ? candidate : '';
  }, [router.query.redirect]);

  const closePanel = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [isOpen, closePanel]);

  useEffect(() => {
    if (isOpen) {
      setAuthView(initialView);
      setContentAnimation('idle');
      contentScrollRef.current?.scrollTo(0, 0);
      return;
    }
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
    transitionLocked.current = false;
    setAuthView('login');
    setContentAnimation('idle');
  }, [isOpen, initialView]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  const switchAuthView = (nextView: AuthView) => {
    if (nextView === authView || transitionLocked.current) return;

    transitionLocked.current = true;
    setContentAnimation(nextView === 'signup' ? 'exit-left' : 'exit-right');
    transitionTimer.current = window.setTimeout(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setAuthView(nextView);
      setContentAnimation(nextView === 'signup' ? 'enter-right' : 'enter-left');
      contentScrollRef.current?.scrollTo(0, 0);
      window.requestAnimationFrame(() => {
        document.getElementById(nextView === 'signup' ? 'signup-fullname' : 'landing-email')?.focus({ preventScroll: true });
      });
      transitionTimer.current = window.setTimeout(() => {
        setContentAnimation('idle');
        transitionLocked.current = false;
      }, 180);
    }, 140);
  };

  const clearAlert = () => setAlert(null);

  const setFieldErrorState = (field: 'email' | 'password', value: string) => {
    if (field === 'email') setEmailError(value);
    if (field === 'password') setPasswordError(value);
  };

  const validateForm = () => {
    const nextEmailError = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Please enter a valid email' : '';
    const nextPasswordError = !password ? 'Please enter your password' : '';

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    return !nextEmailError && !nextPasswordError;
  };

  const handleEmailPasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearAlert();

    if (!validateForm()) {
      return;
    }

    const client = (window as any).supabaseClient;
    if (!client) {
      setAlert({ type: 'error', message: 'Authentication is unavailable right now. Please try again.' });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      const profileResult = await client.from('profiles').select('role,onboarding_completed').eq('id', data.user.id).maybeSingle();
      const profile = profileResult.data;
      const role = (profile && profile.role) || (data.user.user_metadata && data.user.user_metadata.role);

      if (!profile || !profile.onboarding_completed) {
        window.location.assign('/onboarding' + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''));
        return;
      }

      window.location.assign(redirect || (role === 'host' ? '/host-home' : '/client-home'));
    } catch (err: any) {
      const message = err?.message || 'Login failed. Please try again.';
      const normalized = String(message).toLowerCase();
      const friendlyMessage = normalized.includes('invalid')
        ? 'Incorrect email or password.'
        : normalized.includes('not confirmed')
          ? 'Please confirm your email before logging in.'
          : message;
      setAlert({ type: 'error', message: friendlyMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    clearAlert();
    const client = (window as any).supabaseClient;
    if (!client) {
      setAlert({ type: 'error', message: 'Google authentication is unavailable right now.' });
      return;
    }

    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth-callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`,
        },
      });

      if (error) {
        setAlert({ type: 'error', message: error.message || 'Could not connect to Google. Please try again.' });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: error?.message || 'Could not connect to Google. Please try again.' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none"
      aria-hidden={!isOpen}
      style={{
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 260ms ease',
      }}
    >
      <button
        type="button"
        aria-label="Close sign-in panel"
        className="absolute inset-0 bg-transparent"
        onClick={closePanel}
        style={{
          pointerEvents: isOpen ? 'auto' : 'none',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 260ms ease',
        }}
      />

      <aside
        className="absolute inset-y-0 right-0 h-[100dvh] w-full overflow-hidden md:w-1/2"
        style={{
          pointerEvents: isOpen ? 'auto' : 'none',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          opacity: isOpen ? 1 : 0,
          transition: 'transform 650ms cubic-bezier(0.22, 1, 0.36, 1), opacity 500ms ease',
        }}
        aria-modal="true"
        role="dialog"
        aria-labelledby={authView === 'login' ? 'auth-panel-title' : 'auth-panel-signup-title'}
      >
        <div className="relative h-full w-full overflow-hidden border-l border-white/10 bg-[rgba(17,18,18,0.88)] text-[#f5efe7]">
          <button
            type="button"
            onClick={closePanel}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-[#f4efe9] transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            aria-label="Close sign in"
          >
            <X size={18} />
          </button>

          <div
            ref={contentScrollRef}
            className="h-full w-full overflow-y-auto overscroll-contain"
            data-auth-scroll
            style={{ pointerEvents: contentAnimation === 'idle' ? 'auto' : 'none' }}
          >
            <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col justify-center px-6 py-16 sm:px-8 lg:px-10">
              <div
                className={`auth-content ${contentAnimation === 'exit-left' ? 'auth-content-exit-left' : ''} ${contentAnimation === 'enter-right' ? 'auth-content-enter-right' : ''}`}
                style={{ display: authView === 'login' ? undefined : 'none' }}
                aria-hidden={authView !== 'login'}
              >
                <div className="w-full">
            <div className="mb-8">
              <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#d9d1c6]/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#d6ddd2]">
                <Lock size={12} />
                Secure access
              </p>
              <h2 id="auth-panel-title" className="text-3xl font-semibold tracking-[-0.04em] text-[#f4efe9]">
                Log in to VaRoom.
              </h2>
              <p className="mt-2 text-sm text-[#d9d2c9]/80">Access your host or client account.</p>
            </div>

            {alert && (
              <div
                className={`mb-5 rounded-xl border px-3 py-2 text-sm ${
                  alert.type === 'error'
                    ? 'border-[#efb6ae]/30 bg-[#7d2a22]/30 text-[#f9d3ce]'
                    : 'border-[#7ac7a3]/30 bg-[#1d4737]/40 text-[#d7f7e6]'
                }`}
                role="alert"
              >
                {alert.message}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleEmailPasswordSubmit} noValidate>
              <div>
                <label htmlFor="landing-email" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#d7d2ca]/70" />
                  <input
                    id="landing-email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (emailError) setFieldErrorState('email', '');
                    }}
                    onBlur={() => setFieldErrorState('email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Please enter a valid email' : '')}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className={`auth-control h-14 w-full rounded-2xl border bg-[#f5efe8]/8 py-0 pl-10 pr-10 text-sm leading-5 text-[#f5efe8] placeholder:text-[#d3c7ba]/55 outline-none transition ${
                      emailError ? 'border-[#efb6ae] focus:border-[#efb6ae]' : 'border-white/10 focus:border-[#dde3d6]/45'
                    }`}
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? 'landing-email-error' : undefined}
                  />
                </div>
                {emailError && (
                  <p id="landing-email-error" className="mt-1 text-xs text-[#f3c0b6]">{emailError}</p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="landing-password" className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[#d4cdbd]/70">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.location.assign(`/forgot-password${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`);
                      }
                    }}
                    className="border-0 bg-transparent p-0 text-xs font-medium text-[#f0e7df] underline-offset-2 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="relative">
                  <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#d7d2ca]/70" />
                  <input
                    id="landing-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (passwordError) setFieldErrorState('password', '');
                    }}
                    onBlur={() => setFieldErrorState('password', !password ? 'Please enter your password' : '')}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className={`auth-control auth-control--trailing-icon h-14 w-full rounded-2xl border bg-[#f5efe8]/8 py-0 pl-10 pr-10 text-sm leading-5 text-[#f5efe8] placeholder:text-[#d3c7ba]/55 outline-none transition ${
                      passwordError ? 'border-[#efb6ae] focus:border-[#efb6ae]' : 'border-white/10 focus:border-[#dde3d6]/45'
                    }`}
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={passwordError ? 'landing-password-error' : undefined}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#d7d2ca] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/60"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordError && (
                  <p id="landing-password-error" className="mt-1 text-xs text-[#f3c0b6]">{passwordError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#111111] px-4 py-3 text-sm font-semibold text-[#f7f3ee] transition-colors duration-200 hover:bg-[#292827] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:cursor-not-allowed disabled:opacity-80"
              >
                {isLoading ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#151310]/25 border-t-[#151310]" aria-hidden="true" />
                    Logging in...
                  </>
                ) : (
                  'Log in'
                )}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#d7d2ca]/65">
              <span className="h-px flex-1 bg-white/10" />
              <span>or sign in with</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[#f6f0ea] transition hover:bg-white/10"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </button>

            <p className="mt-7 text-center text-sm text-[#e2d9d1]/80">
              New to VaRoom?{' '}
              <button type="button" onClick={() => switchAuthView('signup')} className="border-0 bg-transparent p-0 font-semibold text-white underline-offset-4 hover:underline">
                Create an account
              </button>
            </p>
                </div>
              </div>

              <div
                className={`auth-content ${contentAnimation === 'exit-right' ? 'auth-content-exit-right' : ''} ${contentAnimation === 'enter-left' ? 'auth-content-enter-left' : ''}`}
                style={{ display: authView === 'signup' ? undefined : 'none' }}
                aria-hidden={authView !== 'signup'}
              >
                <SignupForm
                  key={`${isOpen ? 'open' : 'closed'}-${initialRole}`}
                  redirect={redirect}
                  initialRole={initialRole}
                  onSwitchToLogin={() => switchAuthView('login')}
                />
              </div>
            </div>
          </div>
        </div>
      </aside>
      <style jsx>{`
        .auth-content-exit-left {
          animation: auth-content-exit-left 140ms ease-in both;
        }

        .auth-content-exit-right {
          animation: auth-content-exit-right 140ms ease-in both;
        }

        .auth-content-enter-right {
          animation: auth-content-enter-right 180ms ease-out both;
        }

        .auth-content-enter-left {
          animation: auth-content-enter-left 180ms ease-out both;
        }

        @keyframes auth-content-exit-left {
          to { opacity: 0; transform: translateX(-16px); }
        }

        @keyframes auth-content-exit-right {
          to { opacity: 0; transform: translateX(16px); }
        }

        @keyframes auth-content-enter-right {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes auth-content-enter-left {
          from { opacity: 0; transform: translateX(-16px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .auth-content-exit-left,
          .auth-content-exit-right,
          .auth-content-enter-right,
          .auth-content-enter-left {
            animation-duration: 1ms;
          }
        }
      `}</style>
    </div>
  );
};
