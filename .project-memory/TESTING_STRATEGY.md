# Testing Strategy

Available checks:
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd frontend && npm audit --omit=dev`

Validated on 2026-09-01:
- `npm run lint` passed.
- `npm run build` passed after deployment edits and produced `.next/standalone/server.js`.
- `npm audit --omit=dev` failed because the npm registry audit endpoint returned an error, not because a vulnerability report was received.

Required production smoke flow:
- Admin login.
- Multipart upload for small and large CSV files.
- Confirm each presigned PUT response exposes `ETag` in browser devtools.
- Dataset preview and analyze.
- Smoke train with `1` epoch and limited rows.
- Full train and job polling to terminal state.
- Models list for admin and user.
- Scenario prediction for action and item/content/context task types.
- Classic recommendation only for legacy `user_id` models.
