# Change History

## 2026-09-01

- Prepared frontend deployment for VPS/Nginx.
- Enabled Next.js standalone output in `frontend/next.config.ts`.
- Added production env example with `/api/v1` base URL.
- Added Nginx VPS sample with separate app/API/storage upstreams.
- Added MinIO/S3 CORS sample exposing `ETag`.
- Improved multipart upload error message for missing `ETag`.
- Updated README and deployment docs for Node 22, `/api/v1`, multipart upload, and scenario prediction.
- Removed `next/font/google` dependency so production builds do not require fetching Google Fonts.
- Fixed multipart presigned PUT headers by removing `Authorization` and matching the init `Content-Type` exactly.
