# Deployment

Frontend:
- Use Node.js 22+.
- Install with `npm ci`.
- Build with `npm run build`.
- `frontend/next.config.ts` uses `output: 'standalone'`.
- Production env example: `frontend/.env.production.example`.

VPS/Nginx:
- Example config: `deploy/nginx/recommender-ui.vps.conf`.
- UI domain proxies to Next.js on `127.0.0.1:3000`.
- API domain proxies to FastAPI on `127.0.0.1:8000`.
- Storage domain proxies to MinIO/S3 on `127.0.0.1:9000`.

Large upload:
- Multipart uploads should bypass Next.js after init/presign.
- Storage CORS must include frontend origin and expose `ETag`.
- Example bucket CORS: `deploy/minio/cors.json`.
