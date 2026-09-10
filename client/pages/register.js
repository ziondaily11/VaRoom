import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const query = new URLSearchParams({ signup: '1' });
    if (typeof router.query.redirect === 'string') {
      query.set('redirect', router.query.redirect);
    }
    router.replace(`/?${query.toString()}`);
  }, [router]);

  return null;
}
