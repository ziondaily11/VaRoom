# Production deployment checks

The Vercel deployment uses the Next.js client in `client/`. Before merging a
change to `main`, the **Client CI / Build and validate client** GitHub Actions
check installs the locked dependencies, validates the booking page's inline
scripts, and runs the production Next.js build.

The active `Protect main with client CI` ruleset targets `main`, requires pull
requests, and requires the **Vercel** status check to pass. Its bypass list is
empty, so direct pushes and bypasses are blocked.

After **Build and validate client** has run at least once on a pull request,
add that check to the ruleset's required status checks as well. This also gates
the booking inline-script validation, which Next.js does not compile itself.

The workflow also runs after pushes to `main`, but a push-triggered check is
post-deployment. Keep production changes going through pull requests so the
required Vercel preview deployment can gate the merge.
