# API Inventory

Last updated: Thursday, July 30, 2026

Source of truth:
- FastAPI router mount tree: `src/api/v1/router.py`
- Handler modules: `src/api/v1/handler/{auth,engine,admin,models}.py`
- Shared auth dependencies: `src/api/v1/deps.py`
- Request/response contracts: `src/model/*.py`

Base path: `http://127.0.0.1:8000/api/v1`

## Auth

| Method | Route | Request | Response | Auth | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/auth/register` | `UserCreateRequest` | `UserCreateResponse` | Public | Public signup is intentionally disabled and returns `403`. |
| `POST` | `/auth/login` | `UserLoginRequest` | `UserLoginResponse` | Public | Rate-limited in-memory; returns `roles`, `permissions`, `exp`, `expires_in`. |
| `POST` | `/auth/refresh` | `RefreshTokenRequest` | `RefreshTokenResponse` | Refresh token | Rotates refresh token; returns fresh access and refresh tokens. |
| `POST` | `/auth/logout` | `LogoutRequest` | `LogoutResponse` | Token payload in body | Frontend sends current access token for revoke-before-clear behavior. |
| `GET` | `/auth/me` | None | `UserMeResponse` | Bearer access token | Role-aware session bootstrap source for the UI. |

Common auth errors:
- `401` missing header, invalid scheme, invalid/expired token, revoked token
- `403` registration disabled

## User-Facing Models

| Method | Route | Request | Response | Auth | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/models/available` | Query only | `AvailableModelsResponse` | `USER` or `ADMIN` | Preferred user-facing model list. Only succeeded/usable models should be shown in inference UI. `experiment_name` is human-readable and should be preferred in model pickers. May also include `inference_profile` for preset/source-of-truth inference metadata. |

Compatibility note:
- Current frontend falls back to `/engine/models/me` if `/models/available` is unavailable.

## Admin

### User management

| Method | Route | Request | Response | Auth | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/users` | None | `AdminUsersResponse` | `ADMIN` | No UI yet; backend capability exists. |
| `GET` | `/admin/users/{user_id}` | Path `user_id` | `AdminUserResponse` | `ADMIN` | Returns `404` if user does not exist. |
| `POST` | `/admin/users` | `AdminUserCreateRequest` | `AdminUserResponse` | `ADMIN` | Intended replacement for public signup. |
| `PATCH` | `/admin/users/{user_id}` | `AdminUserUpdateRequest` | `AdminUserResponse` | `ADMIN` | Partial user update. |
| `POST` | `/admin/users/{user_id}/roles` | `AdminUserRoleUpdateRequest` | `AdminUserResponse` | `ADMIN` | Adds one or more roles. |
| `DELETE` | `/admin/users/{user_id}/roles/{role_name}` | Path params | `AdminUserResponse` | `ADMIN` | Removes a role. |

### Admin model inventory and audit

| Method | Route | Request | Response | Auth | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/models` | None | `TrainedModelsResponse` | `ADMIN` | Preferred admin inventory endpoint. |
| `GET` | `/admin/system/logs` | Query filters | `SystemLogsResponse` | `ADMIN` | Supports pagination, `since`, `action`, `actor_user_id`, snapshot toggles. |

## Engine: Datasets

| Method | Route | Request | Response | Auth | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/engine/datasets/db` | Query: `include_all`, `limit`, `offset` | `UploadedDatasetsResponse` | Bearer; admin needed for `include_all=true` | Current dataset list source; row counts come from here, not preview. |
| `GET` | `/engine/datasets/download` | Query: `dataset_id`, optional `file_name` | File/blob | Bearer | Owners or admins only. |
| `DELETE` | `/engine/datasets/me` | None | `EngineBulkDatasetDeleteResponse` | `ADMIN` | Bulk delete current user datasets. |
| `DELETE` | `/engine/datasets/{dataset_id}` | Path `dataset_id` | `EngineDatasetDeleteResponse` | Bearer; admin or owner | Soft delete + best-effort storage cleanup. |
| `GET` | `/engine/datasets/{dataset_id}/preview` | Path `dataset_id` | `EngineDatasetPreviewResponse` | Bearer | Returns sample rows only; intentionally not full row count. |
| `POST` | `/engine/datasets/upload` | Raw CSV body + `filename` query | `EngineDatasetUploadResponse` | `ADMIN` | Legacy direct upload path. |
| `POST` | `/engine/datasets/upload/multipart/init` | Query: `filename`, `content_type` | `EngineMultipartUploadInitResponse` | `ADMIN` | Multipart upload entrypoint. |
| `GET` | `/engine/datasets/upload/multipart/presign` | Query: `dataset_id`, `upload_id`, `part_number`, `expires_seconds` | `EngineMultipartUploadPresignResponse` | `ADMIN` | Frontend must pass returned `headers` during `PUT`. |
| `POST` | `/engine/datasets/upload/multipart/complete` | `EngineMultipartUploadCompleteRequest` + `dataset_id` query | `EngineDatasetUploadResponse` | `ADMIN` | Finalizes multipart upload. |
| `POST` | `/engine/datasets/{dataset_id}/analyze` | `EngineDatasetAnalyzeRequest` | `EngineDatasetAnalyzeResponse` | `ADMIN` | Returns strategy, `task_type`, mapping, feasibility, and `training_payload`. For movie datasets, `mapping.title` may be detected as `movie_name`. |

Important dataset validations:
- `sample_rows` is `1..10000`
- Multipart `part_number` is `>= 1`
- Multipart presign may return required headers even when currently empty

## Engine: Training, Jobs, and Models

| Method | Route | Request | Response | Auth | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/engine/train/auto` | `EngineAutoTrainRequest` | `EngineAutoTrainResponse` | `ADMIN` | Auto training flow. |
| `POST` | `/engine/train` | `EngineTrainRequest` | `EngineTrainResponse` | `ADMIN` | Main training entrypoint; `num_epochs >= 1`, optional strategy/mapping/max_rows. |
| `GET` | `/engine/models` | None | `TrainedModelsResponse` | `ADMIN` | Admin fallback inventory. |
| `GET` | `/engine/models/me` | None | `TrainedModelsResponse` | Bearer | User/admin fallback inventory by ownership. |
| `DELETE` | `/engine/models/me` | Query cleanup options | `EngineBulkModelDeleteResponse` | Bearer | Bulk delete owned models. |
| `DELETE` | `/engine/models/{job_id}` | Path `job_id` | `EngineDeleteResponse` | Bearer | Current model delete action in admin UI. |
| `GET` | `/engine/jobs/{job_id}` | Path `job_id` | `EngineJobInfoResponse` | `ADMIN` | Job manifest, summary, DB state. |
| `GET` | `/engine/jobs/{job_id}/progress` | Path `job_id` | `EngineJobProgressResponse` | `ADMIN` | Progress event stream summary; may return `503` when Redis is unavailable. |
| `GET` | `/engine/train/{job_id}/epochs` | Path `job_id` | `EngineJobEpochsResponse` | `ADMIN` | Preferred training poll source before progress. |
| `GET` | `/engine/jobs/{job_id}/state` | Path `job_id` | `EngineJobStateResponse` | `ADMIN` | Final source of truth for terminal state; may self-heal stuck jobs to `succeeded`. |
| `POST` | `/engine/jobs/{job_id}/cancel` | Empty JSON body | `EngineJobCancelResponse` | `ADMIN` | Cooperative cancel flow; idempotent for already canceled jobs; returns `409` if already terminal as succeeded/failed. |
| `DELETE` | `/engine/jobs/{job_id}` | Path `job_id` | `EngineDeleteResponse` | `ADMIN` | Hard delete job artifacts. |
| `PUT` | `/engine/jobs/{job_id}/attach-dataset` | `AttachJobDatasetRequest` | `AttachJobDatasetResponse` | `ADMIN` | Backend capability exists; no UI yet. |

Training/job compatibility rules currently implemented in the frontend:
- Poll order: `epochs -> progress -> state`
- If `epochs` or `progress` returns `503 Redis unavailable`, fall back to `state`
- Treat `state` as final truth for terminal states
- Normalize statuses across `queued/pending`, `running`, `succeeded/completed`, `canceled`, `failed/error`

## Engine: Recommendations and Prediction

| Method | Route | Request | Response | Auth | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/engine/jobs/{job_id}/recommend` | Query: `user_id`, `top_k` | `EngineRecommendResponse` | `USER` or `ADMIN` | Classic user-facing recommendation flow kept for compatibility. Recommendation items now add optional `movie_name` without removing `item_id`. |
| `GET` | `/engine/jobs/{job_id}/prediction` | Query-driven sample fields | `EnginePredictionResponse` | `USER` or `ADMIN` | Alternate sample prediction route; not primary frontend flow. Recommendation items may also include optional `movie_name`. |
| `POST` | `/engine/jobs/{job_id}/prediction/scenario` | `EngineScenarioPredictionRequest` | `EnginePredictionResponse` | `USER` or `ADMIN` | Primary frontend inference route for dataset-agnostic sample-based flows. Recommendation items may also include optional `movie_name`. |

Important prediction notes:
- `top_k` for scenario prediction is `1..100`
- `item_id` in results is not guaranteed numeric
- Model list endpoints and `GET /engine/jobs/{job_id}` may expose `inference_profile` with `supported_presets`, `recommended_preset`, `sample_fields`, and `required_sample_fields`
- Frontend should prefer `inference_profile` from the selected model object and fall back to job detail hydration when needed
- Frontend must not infer preset names from filenames when `inference_profile` exists
- `movie_name` is additive and may be `null`; frontend should interpret it as a generic display title and fall back to `item_id`
- `task_type` is the primary rendering switch for the recommendations UI
- `task_type === "action_recommendation"` adds `recommended_action`, `action_candidates`, and `effectiveness_estimate`
- `recommended_action` and `action_candidates` should render above any generic ranked results table
- `effectiveness_estimate` is a model estimate and should not be labeled as a guaranteed KPI or business probability
- `action_candidates` may expose effectiveness as `score` or `mean_effectiveness`; frontend should normalize both
- Preset shortcuts should be limited to `supported_presets`; when empty, the frontend should fall back to the generic editor only

## Frontend-Used Endpoint Set

These are the endpoints the current UI already uses directly or via compatibility fallback:
- Auth: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`
- User models: `/models/available`, fallback `/engine/models/me`
- Admin models: `/admin/models`, fallbacks `/engine/models`, `/engine/models/me`
- Datasets: `/engine/datasets/db`, `/engine/datasets/{id}/preview`, `/engine/datasets/download`, multipart upload endpoints, `/engine/datasets/{id}/analyze`, delete routes
- Training/jobs: `/engine/train`, `/engine/train/auto`, `/engine/train/{job_id}/epochs`, `/engine/jobs/{job_id}/progress`, `/engine/jobs/{job_id}/state`, `/engine/jobs/{job_id}`, `/engine/jobs/{job_id}/cancel`
- Recommendations: `/engine/jobs/{job_id}/recommend`, `/engine/jobs/{job_id}/prediction/scenario`
- Audit/logging: `/admin/system/logs`

## Backend Capabilities Present But Not Yet Exposed In The UI

- Full admin user management under `/admin/users*`
- `GET /engine/jobs/{job_id}/prediction` sample-based query prediction route
- `PUT /engine/jobs/{job_id}/attach-dataset`
- Bulk delete routes for datasets and models
