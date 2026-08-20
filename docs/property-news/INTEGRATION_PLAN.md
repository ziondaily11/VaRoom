# Integration Plan - Deferred Until Explicit Approval

This file deliberately lists future changes without making them.

| Existing file/component | Required future modification | Phase 1 status |
| --- | --- | --- |
| `server/server.js` | Mount/proxy the isolated news router or deploy the news service behind the VaRoom API gateway; add request authentication/rate-limit integration. | Not modified. |
| `server/lib/supabaseClient.js` | Optionally supply a scoped server-side news repository/client after secrets/deployment are reviewed. | Not modified. |
| `main.py` | Add a news-intent/tool path that requests evidence from the news service and preserves regulatory status/source citations. | Not modified. |
| `chatbot/main.py` | Reconcile with the actually deployed `main.py` before applying the same Elie news tool. | Not modified. |
| `client/elie.html` | Render news answers/source links only after backend integration; do not access news database/service role directly. | Not modified. |
| VaRoom client navigation/pages | Add a Property Insights entry, feed, filters, article view, and review dashboard route after UX approval. | Not modified. |
| Existing environment files | Add only deployment-approved news variables through the platform secret manager. | Not modified. |

## Required Phase 2 decisions

- Identify the authoritative deployed Elie Python service, since both root and `chatbot/` copies exist.
- Confirm the target Supabase project/environment and normal migration process.
- Establish a managed Supabase administrator role lifecycle for `app_metadata.news_admin`.
- Decide whether the isolated service remains separately deployed or becomes a mounted router in the Express server.
- Approve the public Property Insights UX, legal/source terms, retention period for source evidence, and an initial verified source list.

Do not perform these modifications until the owner explicitly approves integration.
