# API

The service listens independently (default `http://localhost:8010`) and is not mounted into the existing Express process.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Isolated-service configuration health. |
| `GET /api/news` | Published items; filters: `category`, `county`, `town`, `regulatory_status`, `source`, `limit`. |
| `GET /api/news/:id` | One published safe editorial record. |
| `GET /api/news/latest` | Recent published items. |
| `GET /api/news/search?q=` | Keyword/ranked evidence search with location/status/date filters. |
| `GET /api/news/related/:id` | Related published evidence. |
| `GET /api/elie/news-search?q=` | Structured evidence for a future Elie tool. |
| `GET /api/admin/news/pending` | Protected private review queue. |
| `POST /api/admin/news/:id/approve` | Protected publish decision. |
| `POST /api/admin/news/:id/reject` | Protected rejection. |
| `POST /api/admin/news/:id/edit` | Protected editorial edit. |
| `POST /api/admin/news/:id/request-more-evidence` | Protected review hold. |
| `GET /api/admin/sources/health` | Protected source monitoring. |

Public read endpoints have a simple in-process rate limiter. Production should enforce equivalent limits at the reverse proxy/API gateway and run this service behind the same TLS/origin policy as VaRoom.
