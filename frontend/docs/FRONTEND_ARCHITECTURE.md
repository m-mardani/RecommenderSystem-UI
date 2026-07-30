# Frontend Architecture

Last updated: Thursday, July 30, 2026

## Summary

The frontend is a single Next.js 16 App Router application in `frontend/`. It is a route-driven UI with page-level data loading, a single auth context, centralized API adapters, and role-aware navigation. The architecture is already in a good place for incremental modernization because API parsing is mostly centralized and business rules are not heavily duplicated across pages.

## Route and Component Tree

```text
App
├── page.tsx
│   └── redirects to /login or /dashboard
├── layout.tsx
│   └── AuthProvider
├── login/page.tsx
│   └── login form
├── register/page.tsx
│   └── registration disabled notice
├── dashboard/page.tsx
│   ├── ProtectedRoute
│   └── Navbar
├── datasets/page.tsx
│   ├── ProtectedRoute(adminOnly)
│   ├── Navbar
│   ├── multipart upload flow
│   ├── dataset preview panel
│   └── dataset analysis panel
├── training/page.tsx
│   ├── ProtectedRoute(adminOnly)
│   ├── Navbar
│   ├── dataset select + num_epochs + max_rows
│   └── analysis-backed training payload review
├── jobs/page.tsx
│   ├── ProtectedRoute(adminOnly)
│   ├── Navbar
│   └── job polling + cancel UI
├── models/page.tsx
│   ├── ProtectedRoute
│   ├── Navbar
│   └── admin/user-aware model inventory
├── recommendations/page.tsx
│   ├── ProtectedRoute
│   ├── Navbar
│   ├── classic recommendation mode
│   └── scenario prediction mode
└── system-logs/page.tsx
    ├── AdminOnlyRoute
    └── audit/snapshot viewer
```

## Shared Runtime Pieces

### Auth and route gating
- `contexts/AuthContext.tsx` owns session bootstrap, login, logout, `isAuthenticated`, and `isAdmin`.
- `components/common/ProtectedRoute.tsx` redirects unauthenticated users and renders a 403 panel for non-admin access.
- `components/common/AdminOnlyRoute.tsx` is still used by system logs and should eventually be reconciled with `ProtectedRoute(adminOnly)` for consistency.

### API and typing
- `lib/api/client.ts` owns the Axios client, token storage, auth headers, and refresh flow.
- `lib/api/index.ts` is the integration boundary for endpoint calls, compatibility fallbacks, and response normalization.
- `types/index.ts` contains shared UI/domain types; newer work already moved dataset analysis, scenario prediction, and richer training state into normalized types.

### UI shell
- `components/common/Navbar.tsx` is the global authenticated navigation shell.
- `components/common/LoadingSpinner.tsx` and `ErrorMessage.tsx` are the shared async-state primitives.
- `lib/utils/translations.ts` is the central Persian copy dictionary and should remain the only place for reusable UI strings.

## State Ownership and Data Flow

### Session flow
1. Login form calls `useAuth().login`.
2. `AuthContext` calls `authApi.login`, stores tokens, then fetches `/auth/me`.
3. Role-based UI state is derived from `user.roles`.
4. Protected pages rely on `AuthContext` instead of page-local auth checks.

### Page data flow
- Pages own fetch timing, local filters, empty/error/loading states, and user interactions.
- All network behavior should go through `lib/api/index.ts`; pages should consume normalized objects only.
- Jobs/training pages already follow this rule well. `system-logs` is the exception because it still does more raw page-side state and could be normalized later.

## Strengths To Preserve

- Centralized API access with compatibility-aware adapters
- Explicit role gating for admin-only surfaces
- Persian/RTL-first presentation
- Normalized model/training/recommendation types rather than page-local response parsing
- Clear separation between auth/session logic and page rendering

## Architectural Risks and Cleanup Targets

- `system-logs/page.tsx` is less aligned with the normalized adapter pattern than the rest of the app.
- `Navbar` and the main authenticated shell are visually basic and should evolve into a reusable layout system rather than stay page-by-page.
- `translations.ts` is effective, but it is growing into a large monolith; future design-system work may split it by domain.
- `interactive-auth-pages.jsx` is a design asset outside the typed frontend tree; its animation should be extracted into a proper TSX background component instead of being used directly.

## First Modernization Slice Spec: Login Page

Goal:
- Modernize `/login` visually without changing auth/business behavior.

Implementation intent:
- Reuse the canvas/particle/motion language from `interactive-auth-pages.jsx` only as a background layer.
- Keep the form native to `frontend/app/login/page.tsx`.
- Preserve `AuthContext` login flow, disabled registration messaging, RTL, and existing redirect logic.

Acceptance criteria:
- Successful login still routes to `/dashboard`
- Error state renders inside the card without losing the background
- Background animation never blocks pointer or keyboard interaction with the form
- Card is responsive on mobile and desktop
- Focus states remain visible and accessible
- Public signup remains disabled and is shown as an informational state, not a CTA

