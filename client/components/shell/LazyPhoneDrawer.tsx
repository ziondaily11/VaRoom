import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { accountRole } from '../../lib/types/profile';
import { PHONE_MENU_QUERY, phoneMenuState } from '../../lib/shell/phoneMenu';

// Mounts PhoneDrawer on full-screen pages outside the shell: phones only, for
// signed-in onboarded accounts, after the page is idle (so the first paint
// pays nothing and the first tap opens at once). Once mounted it stays; CSS
// hides it if the window widens.
const PhoneDrawer = dynamic(() => import('./PhoneDrawer'), { ssr: false });

export default function LazyPhoneDrawer() {
  const { status, profile, profileError } = useAuth();
  const [ready, setReady] = useState(false);
  const role = accountRole(profile);

  useEffect(() => {
    if (ready) return undefined;
    const phone = window.matchMedia(PHONE_MENU_QUERY);
    let cancel: (() => void) | null = null;
    const schedule = () => {
      if (!phone.matches || cancel) return;
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
        cancel = () => window.cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(() => setReady(true), 300);
        cancel = () => window.clearTimeout(id);
      }
    };
    schedule();
    phone.addEventListener('change', schedule);
    return () => {
      phone.removeEventListener('change', schedule);
      cancel?.();
    };
  }, [ready]);

  return ready && role && phoneMenuState(status, profile, Boolean(profileError)) === 'shown' ? <PhoneDrawer role={role} /> : null;
}
