import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import { CATEGORY_LABELS } from '../lib/marketplace/marketplace';
import { NOT_FOUND_STYLES } from '../components/notFound/notFoundStyles';

// The not-found page: any unknown address, and a profile address that is not
// a usable username (/[username], /host/[hostId]). It offers the way home,
// the way back, a search into the Marketplace and its real categories.
// It always renders light (its drawing is light), and keeps its styles inside
// .not-found-page so nothing else on the site changes while it is open.

/** The Marketplace categories, filtered the way the Marketplace filters them. */
const categories = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label }));

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);

function NeighborhoodIllustration() {
  return (
    <svg
      className="nf-art"
      viewBox="0 0 760 360"
      role="img"
      aria-label="A tiny neighborhood with homes and shops"
    >
      <ellipse cx="390" cy="315" rx="282" ry="26" fill="#d8c1a5" opacity=".35" />
      <path d="M126 273h510v35H126z" fill="#a77b51" />
      <path d="M126 273h510l-22 31H148z" fill="#c69a68" />
      <path d="M196 113 284 56l92 57v157H196z" fill="#ad7952" />
      <path d="m187 119 97-75 101 75-16 13-85-61-80 61z" fill="#6d442c" />
      <path d="M267 83h37v63h-37z" fill="#e6bd84" />
      <path d="m274 110 12-20 12 20z" fill="#5b4235" />
      <path d="M270 166h32v57h-32z" fill="#805335" />
      <circle cx="294" cy="196" r="3" fill="#f0d39b" />
      <path d="M91 196h176v93H91z" fill="#f0e4d5" stroke="#705648" strokeWidth="4" />
      <path d="M78 185h198v20H78z" fill="#d2baa0" stroke="#705648" strokeWidth="4" />
      <path d="M89 160h174v25H89z" fill="#f6eee5" />
      <path d="M105 205h145v36H105z" fill="#bd7654" />
      <path d="M105 241h145v48H105z" fill="#f3e8d8" />
      <path d="M124 253h25v36h-25zM167 253h25v36h-25zM210 253h25v36h-25z" fill="#b5c0b0" />
      <path d="M117 205h18v16h-18zM149 205h18v16h-18zM181 205h18v16h-18zM213 205h18v16h-18z" fill="#f7dba8" />
      <path d="M388 139h172v151H388z" fill="#f1eee7" stroke="#5b5854" strokeWidth="4" />
      <path d="M375 128h198v20H375z" fill="#807c75" stroke="#5b5854" strokeWidth="4" />
      <path d="M405 164h52v51h-52zM469 164h62v51h-62zM405 228h52v62h-52zM469 228h62v62h-62z" fill="#c1d0cc" stroke="#6c716d" strokeWidth="3" />
      <path d="M400 148h150v15H400z" fill="#d1b18a" />
      <path d="M331 206h87v84h-87z" fill="#e8ded0" stroke="#72675c" strokeWidth="4" />
      <path d="M320 194h109v17H320z" fill="#a98162" stroke="#72675c" strokeWidth="4" />
      <path d="M344 226h61v64h-61z" fill="#faf5ed" />
      <path d="M354 238h40v30h-40z" fill="#a9c1bf" />
      <path d="M515 116h83v174h-83z" fill="#f4eee3" stroke="#72675c" strokeWidth="4" />
      <path d="m505 116 51-43 51 43z" fill="#795438" stroke="#60412f" strokeWidth="4" />
      <path d="M539 202h36v88h-36z" fill="#8d6546" />
      <path d="M528 139h22v26h-22zM560 139h22v26h-22z" fill="#9fc1ba" />
      <path d="M153 284c-1-35 9-55 22-55 13 0 22 20 21 55z" fill="#66845d" />
      <path d="M607 290c-1-34 8-53 21-53s22 19 21 53z" fill="#66845d" />
      <path d="m102 275-50-20 9-20 58 13z" fill="#f0e2c8" stroke="#c5a77d" strokeWidth="3" />
      <text x="63" y="247" fill="#4d4037" fontSize="13" fontWeight="700" transform="rotate(-18 63 247)">OFF THE MAP</text>
      <circle cx="91" cy="223" r="28" fill="#c8a276" stroke="#80624a" strokeWidth="4" />
      <circle cx="91" cy="223" r="20" fill="#f0e6d7" />
      <path d="m91 205 5 18-5 18-5-18z" fill="#a14f3c" />
      <path d="m73 223 18-5 18 5-18 5z" fill="#5c7671" />
      <path d="m645 93 50-28 39 25-51 27z" fill="#ead7b6" />
      <circle cx="655" cy="88" r="8" fill="#dc8057" />
      <text x="669" y="94" fill="#4d4037" fontSize="15" fontWeight="700">404</text>
      <path d="m698 113 15 35-27 42-13-7 15-42z" fill="#e5ae4f" />
      <circle cx="698" cy="111" r="17" fill="#efc66f" stroke="#d79d3e" strokeWidth="4" />
    </svg>
  );
}

export default function Custom404() {
  const router = useRouter();
  const { status, profile } = useAuth();
  const role = accountRole(profile);
  const homeHref = status === 'signed-in' ? (role === 'host' ? '/host-home' : role === 'client' ? '/client-home' : '/') : '/';
  const [search, setSearch] = useState('');
  // "Go back" only when there is a page to go back to (known in the browser only).
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => { setCanGoBack(window.history.length > 1); }, []);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    // /properties is the listing wizard; searching is the marketplace's job.
    router.push(query ? `/marketplace?q=${encodeURIComponent(query)}` : '/marketplace');
  }

  return (
    <>
      <Head>
        <title>Page not found · VaRoom</title>
        <meta name="description" content="This VaRoom page could not be found. Find your next stay or space." />
        {/* Some not-found addresses answer 200 (/[username]); keep them out of search results. */}
        <meta name="robots" content="noindex" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: NOT_FOUND_STYLES }} />
      <main className="not-found-page">
        <div className="nf-content">
          <Link className="nf-eyebrow" href={homeHref}>VaRoom</Link>
          <h1 className="nf-code">404</h1>
          <p className="nf-message">Oops! You&apos;ve drifted off the map. Let&apos;s find your way back.</p>
          <div className="nf-actions">
            <Link className="nf-btn nf-btn-primary" href={homeHref}>Go to Home</Link>
            {canGoBack && <button type="button" className="nf-btn" onClick={() => router.back()}>Go back</button>}
          </div>
          <form className="nf-search" onSubmit={submitSearch} role="search">
            <input
              aria-label="Search for your next stay or space"
              type="search"
              enterKeyHint="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search for your next stay or space..."
            />
            <button type="submit" aria-label="Search"><SearchIcon /></button>
          </form>
          <NeighborhoodIllustration />
          <nav className="nf-categories" aria-label="Browse categories">
            {categories.map((category) => (
              <Link className="nf-category" href={`/marketplace?category=${category.key}`} key={category.key}>
                {category.label}
              </Link>
            ))}
          </nav>
        </div>
      </main>
    </>
  );
}
