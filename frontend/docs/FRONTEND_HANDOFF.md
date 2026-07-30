# Frontend Handoff

این سند قرارداد فعلی فرانت با بک‌اند را برای تیم UI خلاصه می‌کند. تاریخ اعتبار این وضعیت: `2026-07-29`.

## Role Split

- کاربر `USER`:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
  - `GET /api/v1/models/available`
  - `GET /api/v1/engine/jobs/{job_id}/recommend`
  - `GET /api/v1/engine/jobs/{job_id}/prediction`
- کاربر `ADMIN`:
  - همه endpointهای بالا
  - endpointهای user management
  - dataset management
  - training/job management
  - admin model inventory

## Auth Notes

- ثبت‌نام عمومی غیرفعال است.
- `POST /api/v1/auth/register` باید از دید فرانت غیرفعال فرض شود و در بک‌اند `403` برمی‌گرداند.
- نمایش منو و صفحه‌ها باید براساس `roles` از `/auth/me` انجام شود.

## User-Facing Models

### List available models

- `GET /api/v1/models/available`

نمونه پاسخ:

```json
{
  "models": [
    {
      "job_id": "8f6a6d2f-1bb0-45bf-9f7b-cdc2d1e7fa51",
      "strategy": "lightgcn",
      "experiment_name": "movielens-lightgcn-v1",
      "completed_at": "2026-07-29T10:20:30Z",
      "evaluation_metrics": {
        "precision_at_10": 0.23
      },
      "dataset_display_name": "ratings.csv"
    }
  ]
}
```

### Inference

- `GET /api/v1/engine/jobs/{job_id}/recommend?user_id=123&top_k=10`
- `GET /api/v1/engine/jobs/{job_id}/prediction?...`

نکته:
- فقط modelهای `succeeded` برای user قابل استفاده‌اند.
- برای jobهای حذف‌شده، ناموفق، یا incomplete انتظار `404` یا `422` داشته باشید.

## Admin Dataset Multipart Flow

ترتیب دقیق frontend flow:

1. `POST /api/v1/engine/datasets/upload/multipart/init?filename=<name>&content_type=<mime>`
2. `GET /api/v1/engine/datasets/upload/multipart/presign?dataset_id=<id>&upload_id=<upload_id>&part_number=<n>`
3. `PUT` مستقیم هر part به `url` برگشتی
4. `ETag` را از response header بردارید
5. `POST /api/v1/engine/datasets/upload/multipart/complete?dataset_id=<id>`
6. برای preview یا download از endpointهای dataset استفاده کنید

### 1. Init

نمونه پاسخ:

```json
{
  "dataset_id": "0d22dc91-f379-42a3-aff3-5ccbe70063c8",
  "upload_id": "MWQyMmRjOTEtZjM3OS00MmEzLWFmZjMtNWNjYmU3MDA2M2M4...",
  "part_size_bytes": 16777216
}
```

### 2. Presign

نمونه پاسخ:

```json
{
  "url": "http://127.0.0.1:9000/rs-datasets/datasets/...partNumber=1&uploadId=...",
  "headers": {}
}
```

نکته:
- فعلا `headers` معمولا خالی است، ولی فرانت باید اگر برگشت داده شد، همان‌ها را در `PUT` بفرستد.

### 3. Upload part

- method: `PUT`
- body: chunk file
- headerهای request: فقط `headers` برگشتی از presign اگر وجود داشت

### 4. ETag handling

- `ETag` را از header پاسخ `PUT` بخوانید.
- اگر مقدار quote داشت، quoteها را حذف کنید.
- مقدار نهایی باید شبیه `58d6c92d11130925a72943c822a5d8fc` به backend برگردد.

### 5. Complete

نمونه request:

```json
{
  "upload_id": "MWQyMmRjOTEtZjM3OS00MmEzLWFmZjMtNWNjYmU3MDA2M2M4...",
  "parts": [
    {
      "part_number": 1,
      "etag": "58d6c92d11130925a72943c822a5d8fc"
    }
  ]
}
```

نمونه پاسخ:

```json
{
  "dataset_id": "0d22dc91-f379-42a3-aff3-5ccbe70063c8",
  "csv_path": null,
  "size_bytes": 1958,
  "num_rows": 0,
  "columns": ["userId", "movieId", "rating", "timestamp"],
  "storage_kind": "s3",
  "bucket": "rs-datasets",
  "object_key": "datasets/.../multipart-smoke.csv",
  "uri": "s3://rs-datasets/datasets/.../multipart-smoke.csv"
}
```

### 6. Preview and Download

- Preview: `GET /api/v1/engine/datasets/{dataset_id}/preview`
- Download: `GET /api/v1/engine/datasets/download?dataset_id=<id>`

## Admin User Management

- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/{user_id}`
- `POST /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{user_id}`
- `POST /api/v1/admin/users/{user_id}/roles`
- `DELETE /api/v1/admin/users/{user_id}/roles/{role_name}`

نمونه create:

```json
{
  "username": "demo-user",
  "email": "demo@example.com",
  "cellphone": "09120000000",
  "password": "StrongPass123!",
  "roles": ["USER"]
}
```

## Training State And Reconcile

- برای polling آموزش این ترتیب را مبنا بگیرید:
  1. `GET /api/v1/engine/train/{job_id}/epochs`
  2. اگر unavailable بود: `GET /api/v1/engine/jobs/{job_id}/progress`
  3. fallback نهایی: `GET /api/v1/engine/jobs/{job_id}/state`

- فیلدهای مهم برای UI:
  - `status`
  - `progress_status`
  - `epoch`
  - `total_epochs`
  - `progress_pct`
  - `eta_seconds`
  - `estimated_completion_at`
  - `completed_at`
  - `duration_seconds`

- رفتار ETA:
  - قبل از اولین epoch ممکن است `eta_seconds = null` باشد
  - بعد از اولین epoch، ETA از `epoch_time` واقعی محاسبه می‌شود
  - در انتهای train، انتظار `eta_seconds = 0` دارید

- رفتار reconcile جدید:
  - اگر job از نظر epoch به `N/N` رسیده باشد
  - ولی state نهایی DB به هر دلیل هنوز `running` مانده باشد
  - endpoint `GET /api/v1/engine/jobs/{job_id}/state` حالا می‌تواند job را self-heal کند
  - یعنی همان call ممکن است job stuck را به `succeeded` تبدیل کند و این فیلدها را پر کند:
    - `completed_at`
    - `duration_seconds`
    - `model_dir` در backend

- نتیجه برای frontend:
  - اگر `progress` یا `epochs` هنوز `running` نشان داد ولی `state` روی poll بعدی `succeeded` شد، این رفتار expected است
  - `state` را source of truth نهایی برای terminal state در نظر بگیرید
  - badge وضعیت `running` می‌تواند این‌گونه نمایش داده شود:
    - `در حال اجرا · 2 دقیقه`
    - یا `در حال اجرا · تا 14:32`

## Common Frontend Errors

- `401 Unauthorized`
  - access token منقضی شده و refresh ناموفق بوده است
- `403 Forbidden`
  - user روی endpoint ادمین رفته است
  - یا registration عمومی غیرفعال است
- `404 Not Found`
  - dataset/job/model وجود ندارد
  - یا upload complete نشده و preview/download زود صدا زده شده است
- `422 Unprocessable Entity`
  - `part_number` یا `upload_id` یا body `complete` اشتباه است
- `500 Multipart upload requires STORAGE_KIND=s3`
  - بک‌اند روی local-file storage بالا آمده و MinIO/S3 فعال نیست
- `Missing ETag for part`
  - فرانت باید `ETag` را از پاسخ `PUT` بخواند؛ اگر proxy/header stripping وجود دارد باید بررسی شود

## Frontend Implementation Notes

- برای page/linkهای admin:
  - `datasets`
  - `training`
  - `jobs`
  - `system-logs`
  فقط برای `ADMIN` نمایش دهید.
- `models` و `recommendations` برای `USER` و `ADMIN` در دسترس هستند.
- اگر نیاز به fallback دارید:
  - available models: fallback به `/api/v1/engine/models/me`
  - admin models: fallback به `/api/v1/engine/models`

## Suggested Smoke Flow

1. ادمین login
2. dataset multipart upload
3. dataset preview
4. training start
5. job/model success
6. user login
7. `GET /models/available`
8. `recommend` یا `prediction`
