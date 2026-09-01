# Known Issues

- Backend source is not present in this repository, so FastAPI, database, Redis, and MinIO/S3 settings cannot be verified locally.
- Large upload failures with `Missing ETag` are caused by storage/proxy CORS/header exposure, not by Next.js compilation.
- `npm audit --omit=dev` previously hung without output in this environment and should be rerun in CI or on the deployment host.
- Admin user management endpoints are documented in handoff docs but do not currently have a UI page.
- `next/font/google` was removed because production builds on VPS can fail when Google Fonts is unreachable. CSS now uses a local/system `Vazirmatn` fallback stack.
- Multipart browser uploads send the bearer token only to the init/presign/complete API calls. The direct presigned storage PUT removes `Authorization` and uses the exact `Content-Type` sent during init; storage CORS must still expose `ETag`.
