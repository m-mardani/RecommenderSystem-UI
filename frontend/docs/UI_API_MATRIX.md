# UI to API Matrix

Last updated: Thursday, July 30, 2026

Status legend:
- `Aligned`: implemented and matches current contract
- `Compat`: implemented with fallback/normalization behavior
- `Partial`: implemented but still a UX or structural cleanup target
- `Missing UI`: backend capability exists but no frontend surface yet

## Current Screen Mapping

| Screen | Major flow | Endpoint(s) | Status | Notes / risks |
| --- | --- | --- | --- | --- |
| `/login` | Username/password login | `POST /auth/login`, `GET /auth/me` | Aligned | Visual modernization pending; logic is correct. |
| `/register` | Disabled public signup notice | none, intentional | Aligned | Must stay informational because `/auth/register` returns `403`. |
| `/dashboard` | Stats cards and quick actions | `GET /engine/datasets/db`, `GET /admin/models` or fallbacks, `GET /engine/jobs/{job_id}` via jobs list flow | Compat | Visual hierarchy is basic; data is useful but presentation is not modernized. |
| `/datasets` | Dataset list | `GET /engine/datasets/db` | Aligned | Uses DB row count correctly. |
| `/datasets` | Multipart upload | `POST /engine/datasets/upload/multipart/init`, `GET /engine/datasets/upload/multipart/presign`, direct `PUT`, `POST /engine/datasets/upload/multipart/complete` | Aligned | Correctly forwards presign headers. |
| `/datasets` | Preview | `GET /engine/datasets/{dataset_id}/preview` | Aligned | Sample-only behavior is documented in UI. |
| `/datasets` | Analyze | `POST /engine/datasets/{dataset_id}/analyze` | Aligned | Good admin workflow foundation; could later support override editing. |
| `/datasets` | Delete / download | `DELETE /engine/datasets/{dataset_id}`, `GET /engine/datasets/download` | Aligned | Admin-only gating is correct. |
| `/training` | Start engine training | `POST /engine/train` | Aligned | Uses `num_epochs`, optional `max_rows`, and analysis-derived payload. |
| `/training` | Auto train | `POST /engine/train/auto` | Partial | Supports epochs, but does not yet expose richer auto-train config beyond dataset + epochs. |
| `/training` | Active-job awareness | `GET /admin/models` and job polling helpers | Compat | Active-train detection is functional but dependent on normalized job inventory. |
| `/jobs` | List jobs | `GET /admin/models`, fallback `/engine/models`, fallback `/engine/models/me`, plus per-job polling | Compat | Good normalization, but UI is still utilitarian. |
| `/jobs` | Poll progress | `GET /engine/train/{job_id}/epochs`, `GET /engine/jobs/{job_id}/progress`, `GET /engine/jobs/{job_id}/state` | Compat | Correct fallback and `state` truth handling already implemented. |
| `/jobs` | Cancel job | `POST /engine/jobs/{job_id}/cancel` | Aligned | Supports real cancel flow and terminal `canceled` state. |
| `/models` | User-facing available models | `GET /models/available`, fallback `/engine/models/me` | Compat | Correct split between available vs admin inventory; prefer human-readable `experiment_name` when present. |
| `/models` | Admin inventory / delete | `GET /admin/models`, fallbacks, `DELETE /engine/models/{job_id}` | Compat | Rich enough functionally; needs design cleanup later. |
| `/recommendations` | Classic recommend | `GET /engine/jobs/{job_id}/recommend` | Compat | Compatibility-only path for older `user_id` recommendation flows; should remain secondary in the UI. |
| `/recommendations` | Scenario prediction | `POST /engine/jobs/{job_id}/prediction/scenario` | Aligned | Primary dataset-agnostic inference path; must handle dynamic sample fields, `task_type`, dedicated action sections, optional legacy `movie_name`, and `inference_profile`-driven preset/sample metadata. |
| `/system-logs` | Audit / snapshot view | `GET /admin/system/logs` | Partial | Backend is rich; UI works but is not yet normalized or polished. |

## Backend Capability Gaps In The Current UI

| Backend capability | Route(s) | UI status | Recommended phase |
| --- | --- | --- | --- |
| Admin user management | `/admin/users*` | Missing UI | After datasets/training cleanup |
| Attach dataset to job | `PUT /engine/jobs/{job_id}/attach-dataset` | Missing UI | Later admin workflow phase |
| Query-style sample prediction | `GET /engine/jobs/{job_id}/prediction` | Missing UI | Adapter should still preserve additive `movie_name` even if the current page does not expose this route directly. |
| Bulk dataset/model deletion | `/engine/datasets/me`, `/engine/models/me` | Missing UI | Optional admin/owner productivity improvement |

## Modernization Priorities

1. `Login modernization`  
Visual-only plus background extraction. No API contract change.

2. `Dashboard redesign`  
Visual/layout improvement with existing stats sources. Mostly visual with small adapter hygiene if needed.

3. `Recommendations refresh`  
Make `prediction/scenario` the default dataset-agnostic inference flow, use `inference_profile` as the preset/source-of-truth metadata layer, keep structured sample editing as the primary input, and retain classic `recommend` only as a compatibility path.

4. `Datasets / training / jobs admin cleanup`  
Consolidate admin workflow into a clearer pipeline: upload → analyze → train → monitor. Mostly layout and interaction restructuring.

5. `Shared design-system consolidation`  
Create reusable shell, card, form, badge, and table primitives after real page patterns have settled.

## Execution Roadmap Classification

| Priority | Area | Type of work |
| --- | --- | --- |
| 1 | Login page | Visual-only plus component extraction |
| 2 | Dashboard | Mostly visual-only |
| 3 | Recommendations | Visual + light page-state refactor |
| 4 | Datasets/training/jobs | Visual + workflow composition |
| 5 | Design system | Shared component extraction and style standardization |
