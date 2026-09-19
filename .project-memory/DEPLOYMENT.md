# Deployment

Frontend:
- Use Node.js 22+.
- Install with `npm ci`.
- Build with `npm run build`.
- `frontend/next.config.ts` uses `output: 'standalone'`.
- Production env example: `frontend/.env.production.example`.
- `NEXT_PUBLIC_API_URL` points to the normal API.
- `NEXT_PUBLIC_TRAINING_API_URL` points to the isolated training API and falls back to `NEXT_PUBLIC_API_URL` when unset.
- Docker build: root `docker-compose.yml` builds `frontend/Dockerfile` and publishes `${UI_HOST_PORT:-3000}:3000`.
- Next.js public API URLs are baked into the client bundle at image build time, so rebuild the UI image when `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_TRAINING_API_URL` changes.

Local bootstrap scripts:
- Ubuntu: `scripts/setup-local-ubuntu.sh`.
- Windows: `scripts/setup-local-windows.ps1`.
- Both scripts prepare `frontend/.env.local`, install/check Node.js 22+, install frontend dependencies, check/install Docker, and start the frontend on port `3000` by default.
- Backend is external to this repo. The scripts do not use Git; they only work from copied local folders. They can start a copied backend when supplied with `--backend-path` / `-BackendPath`; compose-based backends run through Docker Compose, otherwise Python/FastAPI projects with `requirements.txt` or `pyproject.toml` are started with uvicorn.

VPS/Nginx:
- Example config: `deploy/nginx/recommender-ui.vps.conf`.
- UI domain proxies to Next.js on `127.0.0.1:3000`.
- API domain proxies to FastAPI on `127.0.0.1:8000`.
- Storage domain proxies to MinIO/S3 on `127.0.0.1:9000`.

Large upload:
- Multipart uploads should bypass Next.js after init/presign.
- Storage CORS must include frontend origin and expose `ETag`.
- Example bucket CORS: `deploy/minio/cors.json`.
