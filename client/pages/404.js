import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

const categories = [
  { label: 'Hotels', query: 'hotel' },
  { label: 'Vacation Rentals', query: 'vacation rental' },
  { label: 'Studios', query: 'studio' },
  { label: 'Offices', query: 'office' },
  { label: 'Retail', query: 'retail' }
];

function NeighborhoodIllustration() {
  return (
    <svg
      className="neighborhood"
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
  const [search, setSearch] = useState('');

  function submitSearch(event) {
    event.preventDefault();
    const query = search.trim();
    window.location.href = query ? `/properties?search=${encodeURIComponent(query)}` : '/properties';
  }

  return (
    <>
      <Head>
        <title>Page not found — VaRoom</title>
        <meta name="description" content="This VaRoom page could not be found. Find your next stay or space." />
      </Head>
      <main className="not-found">
        <div className="content">
          <p className="eyebrow">VaRoom</p>
          <h1>404</h1>
          <p className="message">Oops! You&apos;ve drifted off the map. Let&apos;s find your way back.</p>
          <form className="search" onSubmit={submitSearch} role="search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search for your next stay or space"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search for your next stay or space..."
            />
            <button type="submit" aria-label="Search">Go</button>
          </form>
          <NeighborhoodIllustration />
          <nav className="categories" aria-label="Browse categories">
            {categories.map((category, index) => (
              <Link
                className={index === 0 ? 'category active' : 'category'}
                href={`/properties?type=${encodeURIComponent(category.query)}`}
                key={category.label}
              >
                {category.label}
              </Link>
            ))}
          </nav>
        </div>
      </main>
      <style jsx global>{`
        :root { --not-found-ink: #24211f; --not-found-paper: #f7f5f1; }
        html, body { margin: 0; min-height: 100%; }
        body { background: var(--not-found-paper); }
        *, *::before, *::after { box-sizing: border-box; }
        .not-found {
          min-height: 100vh;
          display: flex;
          justify-content: center;
          overflow: hidden;
          color: var(--not-found-ink);
          font-family: Inter, Arial, sans-serif;
          background: radial-gradient(circle at 50% 44%, #fffefa 0, var(--not-found-paper) 62%);
        }
        .content {
          width: min(100%, 1040px);
          min-height: 100vh;
          padding: clamp(2.6rem, 8vh, 5.6rem) 1.25rem 2.5rem;
          display: flex;
          align-items: center;
          flex-direction: column;
          text-align: center;
        }
        .eyebrow {
          margin: 0 0 .35rem;
          color: #c41e3a;
          font: 700 .82rem/1 Inter, Arial, sans-serif;
          letter-spacing: .18em;
          text-transform: uppercase;
        }
        h1 {
          margin: 0;
          font: 400 clamp(7rem, 19vw, 12rem)/.84 Arial, sans-serif;
          letter-spacing: -.09em;
        }
        .message { margin: 1.25rem 0 1.75rem; font-size: clamp(.95rem, 2vw, 1.12rem); }
        .search {
          width: min(100%, 350px);
          height: 48px;
          display: flex;
          align-items: center;
          gap: .65rem;
          padding: 0 .5rem 0 1rem;
          border: 1px solid #e6e2dc;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 7px 22px rgba(56, 45, 35, .12);
        }
        .search > span { color: #716b66; font: 1.75rem/1 Arial, sans-serif; transform: rotate(-20deg); }
        .search input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--not-found-ink); background: transparent; font: .78rem Inter, Arial, sans-serif; }
        .search input::placeholder { color: #aaa6a1; }
        .search button { display: none; }
        .neighborhood { width: min(100%, 760px); height: auto; margin: 1.2rem auto .6rem; }
        .categories { display: flex; flex-wrap: wrap; justify-content: center; gap: .65rem; }
        .category { padding: .62rem 1.35rem; border: 1px solid #34302d; border-radius: 999px; color: var(--not-found-ink); font-size: .82rem; text-decoration: none; transition: transform .15s ease, background .15s ease; }
        .category:hover { transform: translateY(-2px); background: #ebe7e1; }
        .category.active { color: #fff; background: #292725; }
        .category.active:hover { background: #c41e3a; }
        @media (max-width: 600px) {
          .content { padding-top: 3.2rem; }
          .message { max-width: 330px; line-height: 1.5; }
          .neighborhood { margin-top: 1.4rem; }
          .category { padding: .56rem .85rem; font-size: .73rem; }
        }
      `}</style>
    </>
  );
}
