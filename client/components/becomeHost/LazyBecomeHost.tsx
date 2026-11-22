import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth/AuthProvider';
import { isHostSetupQuery, useConverting } from '../../lib/becomeHost/becomeHost';

// Stands in for the Become a Host overlay on every page, so its code loads
// only when it opens: on Client Home with ?setup=host, and for as long as the
// account is converting (the page moves to Host Home underneath it). Keyed by
// account, so switching accounts starts over.
const BecomeHostOverlay = dynamic(() => import('./BecomeHostOverlay'), { ssr: false });

export default function LazyBecomeHost() {
  const router = useRouter();
  const { user } = useAuth();
  const converting = useConverting();
  const open = converting || (router.pathname === '/client-home' && isHostSetupQuery(router.query.setup));
  return open && user ? <BecomeHostOverlay key={user.id} /> : null;
}
