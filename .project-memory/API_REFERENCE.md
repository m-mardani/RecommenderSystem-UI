# API Reference

Base URL: `NEXT_PUBLIC_API_URL`, expected production shape `https://api.example.com/api/v1`.

Authentication:
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`

Datasets:
- `GET /engine/datasets/db`
- `POST /engine/datasets/upload` for legacy direct upload.
- `POST /engine/datasets/upload/multipart/init`
- `GET /engine/datasets/upload/multipart/presign`
- Direct `PUT` to returned storage URL. Response must expose `ETag`.
- `POST /engine/datasets/upload/multipart/complete`
- `GET /engine/datasets/{dataset_id}/preview`
- `POST /engine/datasets/{dataset_id}/analyze`
- `GET /engine/datasets/download?dataset_id=...`
- `DELETE /engine/datasets/{dataset_id}`

Training and jobs:
- `POST /engine/train`
- `POST /engine/train/auto`
- `GET /engine/jobs/{job_id}`
- `GET /engine/jobs/{job_id}/state`
- `GET /engine/jobs/{job_id}/progress`
- `GET /engine/train/{job_id}/epochs`
- `POST /engine/jobs/{job_id}/cancel`

Models and inference:
- `GET /models/available`
- `GET /admin/models`
- fallback `GET /engine/models`
- fallback `GET /engine/models/me`
- `GET /engine/jobs/{job_id}`
- `DELETE /engine/models/{job_id}`
- `POST /engine/jobs/{job_id}/prediction/scenario`
- compatibility `GET /engine/jobs/{job_id}/recommend`
