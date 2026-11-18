// Styles for /property-news: the newspaper front page and article. Scoped to
// .property-news-root (nothing reaches the document root or another page). The page keeps
// its newspaper identity (masthead, serif faces, column rules) in both
// themes: dark mode is ink-white type on a near-black page.

export const PROPERTY_NEWS_STYLES = `
        .property-news-root {
          --newspaper-white: #ffffff;
          --newspaper-ink: #111111;
          --newspaper-body: #1c1c1c;
          --newspaper-muted: #555555;
          --newspaper-border: #111111;
          --newspaper-rule-light: #dedede;
          --newspaper-accent: #c41e3a;
          --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
          --font-serif-body: 'Newsreader', Georgia, 'Times New Roman', serif;
          --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          --newspaper-accent-deep: #8b1e2d;
          --newspaper-soft: #f8f8f8;
          --newspaper-faint: #777777;
          --newspaper-skel-a: #eaeaea;
          --newspaper-skel-b: #dfdfdf;
          color-scheme: light;
        }

        /* Dark mode: the same newspaper, light type on a near-black page. */
        html[data-theme="dark"] .property-news-root {
          --newspaper-white: #000000;
          --newspaper-ink: #f2f0ea;
          --newspaper-body: #e4e1da;
          --newspaper-muted: #a4a19a;
          --newspaper-border: #f2f0ea;
          --newspaper-rule-light: rgba(255, 255, 255, 0.14);
          --newspaper-accent: #ef5a6f;
          --newspaper-accent-deep: #ff8a9a;
          --newspaper-soft: #161616;
          --newspaper-faint: #8a8780;
          --newspaper-skel-a: #1c1c1c;
          --newspaper-skel-b: #262626;
          color-scheme: dark;
        }

        .property-news-root {
          margin: 0;
          min-height: 100vh;
          background: var(--newspaper-white);
          color: var(--newspaper-ink);
          font-family: var(--font-sans);
          -webkit-font-smoothing: antialiased;
        }

        .property-news-root a {
          color: inherit;
          text-decoration: none;
        }

        .property-news-root :focus-visible {
          outline: 2px solid var(--newspaper-ink);
          outline-offset: 3px;
        }

        /* =================== NEWSPAPER MASTHEAD =================== */
        .property-news-root .newspaper-masthead-container {
          max-width: 1140px;
          margin: 0 auto;
          padding: 1.25rem 1.5rem 0;
          background: var(--newspaper-white);
        }

        .property-news-root .masthead-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--newspaper-muted);
          padding-bottom: 0.5rem;
        }

        .property-news-root .masthead-brand {
          font-weight: 900;
          letter-spacing: 0.04em;
          color: var(--newspaper-ink);
        }

        .property-news-root .masthead-date-nav {
          display: flex;
          align-items: center;
          gap: 1.2rem;
        }

        .property-news-root .newspaper-nav-link {
          color: var(--newspaper-ink);
          font-weight: 700;
          font-size: 0.8rem;
          letter-spacing: 0.05em;
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: color 0.15s ease;
        }

        .property-news-root button.newspaper-nav-link {
          padding: 0;
          border: 0;
          background: none;
          font: inherit;
          text-transform: inherit;
          cursor: pointer;
        }

        .property-news-root button.newspaper-nav-link:disabled {
          cursor: wait;
          opacity: 0.6;
        }

        .property-news-root .newspaper-nav-link:hover {
          color: var(--newspaper-accent);
        }

        .property-news-root .news-refresh-error {
          grid-column: 1 / -1;
          color: var(--newspaper-accent-deep);
          font-size: 0.9rem;
        }

        .property-news-root .masthead-rule-thick {
          height: 3px;
          background: var(--newspaper-border);
          width: 100%;
        }

        .property-news-root .masthead-rule-thin {
          height: 1px;
          background: var(--newspaper-border);
          width: 100%;
          margin: 2px 0;
        }

        .property-news-root .masthead-center {
          text-align: center;
          padding: 1rem 0 0.85rem;
        }

        .property-news-root .masthead-title-link {
          display: inline-block;
        }

        .property-news-root .masthead-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(2.8rem, 7.8vw, 5.2rem);
          font-weight: 900;
          line-height: 0.95;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          color: var(--newspaper-ink);
        }

        .property-news-root .masthead-badge-va {
          color: var(--newspaper-accent);
        }

        /* =================== MAIN EDITORIAL WRAPPER =================== */
        .property-news-root .newspaper-main {
          max-width: 1140px;
          margin: 0 auto;
          padding: 2rem 1.5rem 5rem;
        }

        .property-news-root .editorial-divider {
          height: 1px;
          background: var(--newspaper-border);
          margin: 1.5rem 0 2rem;
          border: none;
        }

        .property-news-root .eyebrow {
          font-size: 0.78rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 800;
          color: var(--newspaper-ink);
          margin: 0;
        }

        /* =================== ARTICLE DETAIL VIEW =================== */
        .property-news-root .article-header {
          padding-bottom: 0.5rem;
        }

        .property-news-root .article-category-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.8rem;
        }

        .property-news-root .article-headline {
          margin: 0 0 1rem;
          font-family: var(--font-display);
          font-size: clamp(2.1rem, 5vw, 3.5rem);
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: -0.02em;
          color: var(--newspaper-ink);
        }

        /* Dateline: the place in small tracked capitals, the date beneath it
           in the body face, so neither runs into the other. */
        .property-news-root .dateline {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .property-news-root .dateline-place {
          font-family: var(--font-sans);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          line-height: 1.45;
          text-transform: uppercase;
          color: var(--newspaper-ink);
        }

        .property-news-root .dateline-date {
          font-family: var(--font-serif-body);
          font-size: 0.92rem;
          font-style: italic;
          line-height: 1.4;
          color: var(--newspaper-muted);
        }

        .property-news-root .article-header .dateline-place {
          font-size: 0.78rem;
        }

        .property-news-root .article-header .dateline-date {
          font-size: 1.02rem;
        }

        /* Newspaper columns: text in the first, media then text in the second. */
        .property-news-root .article-columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          margin-bottom: 2.5rem;
        }

        .property-news-root .article-columns.single {
          grid-template-columns: minmax(0, 720px);
          justify-content: center;
        }

        .property-news-root .article-col {
          min-width: 0;
        }

        .property-news-root .article-col:first-child {
          padding-right: 2.25rem;
        }

        .property-news-root .article-col + .article-col {
          padding-left: 2.25rem;
          border-left: 1px solid var(--newspaper-rule-light);
        }

        .property-news-root .article-columns.single .article-col:first-child {
          padding-right: 0;
        }

        .property-news-root .detail-summary {
          font-family: var(--font-serif-body);
          font-size: 1.25rem;
          line-height: 1.55;
          font-weight: 600;
          font-style: italic;
          color: var(--newspaper-ink);
          margin: 0 0 1.35rem;
          padding-bottom: 1.1rem;
          border-bottom: 1px solid var(--newspaper-rule-light);
        }

        .property-news-root .detail-body {
          font-family: var(--font-serif-body);
          font-size: 1.1rem;
          line-height: 1.65;
          color: var(--newspaper-body);
        }

        .property-news-root .detail-lead {
          font-size: 1.2rem;
          line-height: 1.6;
          font-weight: 600;
          color: var(--newspaper-ink);
          margin: 0 0 1rem;
        }

        .property-news-root .detail-lead::first-letter {
          font-size: 3.4em;
          float: left;
          line-height: 0.8;
          margin: 0.1em 0.12em 0 0;
          font-family: var(--font-display);
          font-weight: 900;
          color: var(--newspaper-ink);
        }

        .property-news-root .detail-p {
          margin: 0 0 0.95rem;
        }

        .property-news-root .detail-p:last-child {
          margin-bottom: 0;
        }

        .property-news-root .editorial-subhead {
          font-family: var(--font-display);
          font-size: 1.45rem;
          font-weight: 700;
          line-height: 1.28;
          color: var(--newspaper-ink);
          margin: 1.8rem 0 0.7rem;
        }

        .property-news-root .editorial-pullquote {
          margin: 1.5rem 0;
          padding: 1.2rem 1.6rem;
          border-left: 3px solid var(--newspaper-border);
          border-top: 1px solid var(--newspaper-rule-light);
          border-bottom: 1px solid var(--newspaper-rule-light);
          background: var(--newspaper-soft);
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-style: italic;
          line-height: 1.55;
          color: var(--newspaper-ink);
        }

        .property-news-root .editorial-pullquote p {
          margin: 0;
        }

        .property-news-root .detail-notice {
          margin: 1.2rem 0;
          padding: 1rem 1.25rem;
          border-left: 3px solid var(--newspaper-border);
          background: var(--newspaper-soft);
          font-size: 0.9rem;
          font-family: var(--font-sans);
          color: var(--newspaper-muted);
        }

        .property-news-root .article-media {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          margin-bottom: 1.6rem;
        }

        .property-news-root .detail-image-wrap {
          margin: 0;
          opacity: 0;
          transition: opacity 0.25s ease;
        }

        .property-news-root .detail-image-wrap.is-loaded {
          opacity: 1;
        }

        .property-news-root .detail-image {
          display: block;
          width: 100%;
          height: auto;
          max-height: 680px;
          object-fit: cover;
          border: 1px solid var(--newspaper-border);
        }

        .property-news-root .detail-image-caption {
          margin-top: 0.6rem;
          font-family: var(--font-serif-body);
          font-size: 0.88rem;
          line-height: 1.45;
          color: var(--newspaper-muted);
          border-bottom: 1px solid var(--newspaper-rule-light);
          padding-bottom: 0.5rem;
        }

        .property-news-root .caption-text {
          font-weight: 700;
          color: var(--newspaper-ink);
        }

        .property-news-root .caption-credit {
          font-style: italic;
          color: var(--newspaper-faint);
        }

        .property-news-root .newspaper-video-box {
          border: 1px solid var(--newspaper-border);
          padding: 4px;
          background: var(--newspaper-white);
        }

        .property-news-root .newspaper-video {
          display: block;
          width: 100%;
          max-height: 420px;
          background: #000;
        }

        /* Fact Grid */
        .property-news-root .fact-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin: 2rem 0;
          padding: 1.25rem 0;
          border-top: 2px solid var(--newspaper-border);
          border-bottom: 1px solid var(--newspaper-border);
        }

        .property-news-root .fact-label {
          display: block;
          margin-bottom: 0.25rem;
          color: var(--newspaper-muted);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .property-news-root .fact-value {
          font-family: var(--font-serif-body);
          font-size: 1.02rem;
          font-weight: 600;
          line-height: 1.35;
          color: var(--newspaper-ink);
        }

        .property-news-root .source-box {
          margin-top: 1.8rem;
          padding: 1.2rem 1.4rem;
          border: 1px solid var(--newspaper-border);
          background: var(--newspaper-white);
          font-size: 0.88rem;
          line-height: 1.6;
          color: var(--newspaper-body);
        }

        .property-news-root .source-link {
          display: inline-block;
          font-weight: 700;
          color: var(--newspaper-ink);
          text-decoration: underline;
          text-underline-offset: 3px;
          margin-bottom: 0.3rem;
        }

        .property-news-root .source-link:hover {
          color: var(--newspaper-accent);
        }

        /* =================== NEWSPAPER INDEX VIEW =================== */
        .property-news-root .frontpage-lead-article {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
          gap: 2.8rem;
          align-items: stretch;
          padding-bottom: 1.5rem;
        }

        .property-news-root .frontpage-lead-article.no-image {
          grid-template-columns: minmax(0, 1fr);
        }

        .property-news-root .lead-text-trail {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }

        .property-news-root .lead-kicker {
          font-size: 0.74rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--newspaper-ink);
        }

        .property-news-root .lead-headline {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(1.8rem, 3.6vw, 2.65rem);
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: var(--newspaper-ink);
          transition: color 0.15s ease;
        }

        .property-news-root .lead-headline:hover {
          color: var(--newspaper-accent);
        }

        .property-news-root .lead-excerpt {
          font-family: var(--font-serif-body);
          font-size: 1.12rem;
          line-height: 1.65;
          color: var(--newspaper-body);
          margin: 0;
        }

        .property-news-root .lead-image-trail {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .property-news-root .lead-image-link {
          display: flex;
          flex: 1 1 auto;
        }

        /* The frame takes the full height of the lead row, so the image
           runs down to the divider; the img is absolute so its intrinsic
           size never stretches the row. */
        .property-news-root .lead-image-frame {
          position: relative;
          flex: 1 1 auto;
          width: 100%;
          min-height: 280px;
          overflow: hidden;
          border: 1px solid var(--newspaper-border);
          opacity: 0;
          transition: opacity 0.25s ease;
        }

        .property-news-root .lead-image-frame.is-loaded {
          opacity: 1;
        }

        .property-news-root .lead-image {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .property-news-root .frontpage-image-caption {
          margin-top: 0.45rem;
          margin-bottom: 0;
          font-family: var(--font-serif-body);
          font-size: 0.82rem;
          font-style: italic;
          color: var(--newspaper-muted);
          border-bottom: 1px solid var(--newspaper-rule-light);
          padding-bottom: 0.4rem;
        }

        /* Front Page Columns Grid */
        .property-news-root .news-list {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2.2rem;
        }

        .property-news-root .news-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding-right: 1.25rem;
          border-right: 1px solid var(--newspaper-rule-light);
          background: var(--newspaper-white);
          border-radius: 0;
        }

        .property-news-root .news-card:nth-child(3n) {
          border-right: none;
          padding-right: 0;
        }

        .property-news-root .news-card-main {
          display: block;
        }

        .property-news-root .news-card h2 {
          margin: 0 0 0.55rem;
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 700;
          line-height: 1.25;
          color: var(--newspaper-ink);
          transition: color 0.15s ease;
        }

        .property-news-root .news-card h2:hover {
          color: var(--newspaper-accent);
        }

        .property-news-root .news-card p {
          margin: 0 0 0.8rem;
          font-family: var(--font-serif-body);
          font-size: 0.96rem;
          line-height: 1.55;
          color: var(--newspaper-body);
        }

        .property-news-root .news-card .dateline {
          margin-bottom: 0.6rem;
        }

        .property-news-root .news-card-image-wrap {
          height: 0;
          overflow: hidden;
          margin: 0;
          opacity: 0;
          transition: opacity 0.25s ease;
        }

        .property-news-root .news-card-image-wrap.is-loaded {
          height: 180px;
          margin: 0.75rem 0 0.65rem;
          opacity: 1;
        }

        .property-news-root .news-card-image {
          display: block;
          width: 100%;
          height: 180px;
          object-fit: cover;
          border: 1px solid var(--newspaper-border);
        }

        .property-news-root .news-card-source {
          margin-top: 0.6rem;
          color: var(--newspaper-muted);
          font-size: 0.75rem;
          line-height: 1.35;
        }

        .property-news-root .news-card-source-link {
          color: inherit;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .property-news-root .news-card-source-link:hover {
          color: var(--newspaper-accent);
        }

        /* =================== STATES & SKELETONS =================== */
        .property-news-root .state {
          padding: 3.5rem 1.5rem;
          text-align: center;
          border: 2px solid var(--newspaper-border);
          background: var(--newspaper-white);
          color: var(--newspaper-muted);
          line-height: 1.5;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.65rem;
          margin: 2rem 0;
        }

        .property-news-root .state-icon-wrap {
          width: 48px;
          height: 48px;
          border: 1px solid var(--newspaper-border);
          color: var(--newspaper-ink);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.3rem;
        }

        .property-news-root .state-title {
          font-family: var(--font-display);
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--newspaper-ink);
        }

        .property-news-root .state-desc {
          font-family: var(--font-serif-body);
          font-size: 0.98rem;
          color: var(--newspaper-muted);
          max-width: 460px;
          margin: 0;
          line-height: 1.6;
        }

        .property-news-root .state-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--newspaper-ink);
          border: 1px solid var(--newspaper-border);
          padding: 0.3rem 0.8rem;
          margin-top: 0.65rem;
        }

        .property-news-root .state-dot {
          width: 6px;
          height: 6px;
          background: var(--newspaper-ink);
        }

        .property-news-root .newspaper-skeleton-box {
          border: 1px solid var(--newspaper-rule-light);
          padding: 1.5rem;
          background: var(--newspaper-soft);
        }

        .property-news-root .newspaper-skeleton-line {
          height: 14px;
          background: linear-gradient(
            90deg,
            var(--newspaper-skel-a) 0%,
            var(--newspaper-skel-b) 50%,
            var(--newspaper-skel-a) 100%
          );
          background-size: 200% 100%;
          animation: newspaperShimmer 1.5s ease-in-out infinite;
        }

        @keyframes newspaperShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        /* =================== RESPONSIVE DESIGN =================== */
        @media (max-width: 900px) {
          .property-news-root .news-list {
            grid-template-columns: repeat(2, 1fr);
            gap: 1.8rem;
          }
          .property-news-root .news-card:nth-child(3n) {
            border-right: 1px solid var(--newspaper-rule-light);
            padding-right: 1.25rem;
          }
          .property-news-root .news-card:nth-child(2n) {
            border-right: none;
            padding-right: 0;
          }
          .property-news-root .frontpage-lead-article {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
          .property-news-root .article-columns {
            grid-template-columns: minmax(0, 1fr);
          }
          .property-news-root .article-col:first-child, .property-news-root .article-col + .article-col {
            padding: 0;
            border-left: 0;
          }
          .property-news-root .article-col + .article-col {
            margin-top: 1.6rem;
          }
          .property-news-root .lead-image-frame {
            flex: none;
            min-height: 0;
            aspect-ratio: 16 / 10;
          }
        }

        @media (max-width: 768px) {
          .property-news-root .newspaper-masthead-container {
            padding: 1rem 1rem 0;
          }
          .property-news-root .masthead-topbar {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.4rem;
          }
          .property-news-root .masthead-date-nav {
            width: 100%;
            justify-content: space-between;
          }
          .property-news-root .newspaper-main {
            padding: 1.5rem 1rem 3.5rem;
          }
          .property-news-root .news-list {
            grid-template-columns: 1fr;
            gap: 1.6rem;
          }
          .property-news-root .news-card {
            border-right: none;
            border-bottom: 1px solid var(--newspaper-rule-light);
            padding-right: 0;
            padding-bottom: 1.5rem;
          }
          .property-news-root .fact-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
        }
      
        /* =================== UPGRADE: STATES, TOOLS, MORE STORIES, MOTION =================== */
        .property-news-root .state-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.75rem; margin-top: 1.4rem; }
        .property-news-root .news-btn {
          display: inline-flex; align-items: center; gap: 0.45rem; min-height: 38px; padding: 0 1.1rem;
          border: 1px solid var(--newspaper-border); background: transparent; color: var(--newspaper-ink);
          font-family: var(--font-sans); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
          transition: background var(--motion-micro, 150ms) var(--ease-out, ease), color var(--motion-micro, 150ms) var(--ease-out, ease), transform var(--motion-press, 120ms) var(--ease-out, ease);
        }
        .property-news-root .news-btn.primary { background: var(--newspaper-ink); color: var(--newspaper-white); }
        .property-news-root .news-btn:disabled { opacity: 0.6; cursor: default; }
        .property-news-root .news-btn:not(:disabled):active { transform: scale(var(--press-scale, 0.97)); }
        @media (hover: hover) { .property-news-root .news-btn:not(.primary):not(:disabled):hover { background: var(--newspaper-ink); color: var(--newspaper-white); } }
        .property-news-root .news-btn svg { width: 15px; height: 15px; }

        .property-news-root .masthead-date-short { display: none; }
        .property-news-root .article-tools { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .property-news-root .share-status { font-family: var(--font-sans); font-size: 0.75rem; color: var(--newspaper-muted); }

        .property-news-root .more-stories { margin-top: 2.4rem; }
        .property-news-root .more-stories-title {
          margin: 0 0 1rem; padding-top: 0.6rem; border-top: 3px double var(--newspaper-border);
          font-family: var(--font-sans); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
        }
        .property-news-root .more-stories-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.6rem; margin: 0; padding: 0; list-style: none; }
        .property-news-root .more-stories-list li + li { border-left: 1px solid var(--newspaper-rule-light); padding-left: 1.6rem; }
        .property-news-root .more-story-link { display: block; }
        .property-news-root .more-story-link h3 { margin: 0 0 0.4rem; font-family: var(--font-display); font-size: 1.15rem; line-height: 1.25; }
        @media (hover: hover) { .property-news-root .more-story-link:hover h3 { text-decoration: underline; text-underline-offset: 3px; } }
        .property-news-root .back-front { margin-top: 1.6rem; }

        /* First load: stories fade in once; an opened article fades in. */
        .property-news-root .is-revealing .frontpage-lead-article,
        .property-news-root .is-revealing .news-card { animation: newspaperIn var(--motion-standard, 250ms) var(--ease-out, ease) both; }
        .property-news-root .is-revealing .news-card:nth-child(2) { animation-delay: 40ms; }
        .property-news-root .is-revealing .news-card:nth-child(3) { animation-delay: 80ms; }
        .property-news-root .is-revealing .news-card:nth-child(n + 4) { animation-delay: 120ms; }
        .property-news-root .newspaper-article-container { animation: newspaperIn var(--motion-standard, 250ms) var(--ease-out, ease) both; }
        @keyframes newspaperIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

        @media (max-width: 768px) {
          .property-news-root .masthead-topbar { flex-direction: row; align-items: center; justify-content: space-between; flex-wrap: nowrap; gap: 0.75rem; }
          .property-news-root .masthead-date-nav { gap: 0.9rem; flex-wrap: nowrap; white-space: nowrap; }
          .property-news-root .masthead-date-long { display: none; }
          .property-news-root .masthead-date-short { display: inline; }
          .property-news-root .more-stories-list { grid-template-columns: 1fr; gap: 1.1rem; }
          .property-news-root .more-stories-list li + li { border-left: 0; padding-left: 0; border-top: 1px solid var(--newspaper-rule-light); padding-top: 1.1rem; }
        }

        @media (prefers-reduced-motion: reduce) {
          .property-news-root .is-revealing .frontpage-lead-article, .property-news-root .is-revealing .news-card,
          .property-news-root .newspaper-article-container, .property-news-root .newspaper-skeleton-line { animation: none; }
          .property-news-root .news-btn { transition: none; }
          .property-news-root .news-btn:active { transform: none; }
        }
`;
