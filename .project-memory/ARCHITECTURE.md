# Architecture

Runtime shape:
- Next.js App Router application in `frontend/`.
- Browser calls FastAPI through `NEXT_PUBLIC_API_URL`, expected to end in `/api/v1`.
- Axios client in `frontend/lib/api/client.ts` injects JWT access tokens and refreshes expired tokens.
- API adapters and normalization live in `frontend/lib/api/index.ts`.

Page responsibilities:
- `/datasets`: admin dataset list, multipart upload, preview, analyze, download, delete.
- `/training`: admin train/auto-train/smoke-train using analysis-derived payloads.
- `/jobs`: admin polling of job state/progress/epochs plus cancel.
- `/models`: available model list for users, admin inventory/delete for admins.
- `/recommendations`: scenario prediction is primary; classic `user_id` recommendation is compatibility-only.
- `/system-logs`: admin audit/snapshot view.

Authorization:
- `ProtectedRoute` gates authenticated pages.
- `adminOnly` hides/blocks admin pages for users without `ADMIN` role.
