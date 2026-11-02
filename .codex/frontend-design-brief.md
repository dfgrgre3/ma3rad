# CeramiSys ERP UI/UX enhancement brief

## Objective
Upgrade the existing Arabic-first CeramiSys ERP desktop/web application into a polished, modern SaaS-style operations workspace while preserving all existing routing, CRUD flows, database/API contracts, permissions, and business logic. This is an existing React 18 + TypeScript + Vite + Tailwind + Electron application with roughly 247 page/component files, so the work must be incremental and backward compatible.

## Audience and context
Arabic-speaking showroom, inventory, sales, purchasing, finance, operations, HR, CRM, and administration teams. RTL is the primary direction; keep LTR-safe layout behavior for mixed content and numbers.

## Aesthetic direction
Use a calm, premium operations-console language: warm off-white canvas, deep ink text, indigo/blue primary, amber ceramic accent, crisp surfaces, subtle borders, restrained shadows, 10–14px radii, generous but efficient spacing, and clear hierarchy. Keep the current ceramic/enterprise identity and Cairo typography, but move away from the current harsh Windows-10 flat treatment. Favor high-signal density and confident empty space over decoration.

## Implementation scope
- Establish one global design-token layer in `src/index.css` and use it to normalize the existing Tailwind-based pages without rewriting all business screens.
- Refresh the application shell in `src/layouts/MainLayout.tsx` and the existing Header/Sidebar ecosystem only where needed: responsive sidebar, top bar, content canvas, status affordances, focus states.
- Improve shared visual primitives and existing global styles for cards, tables, forms, buttons, badges, dialogs, loading/empty/error states, and mobile overflow.
- Keep the existing language, routes, components, data services, permissions, and integrations intact. Do not replace the framework or add a new component library.
- Ensure desktop, tablet, and mobile breakpoints; support dark mode and prefers-reduced-motion.

## Memorable detail
The shell should feel like a ceramic showroom control room: a restrained indigo navigation rail and warm amber accent used for high-value operational actions and key metrics, with a subtle top-level workspace rhythm that makes every module feel related.

## Image needs
No new raster images are required. Reuse the existing logo/iconography and Lucide icons; this is a product UI refresh, not a marketing page.

## Constraints
- Existing user modifications in the worktree are intentional; preserve unrelated changes.
- Do not remove existing functionality or replace real data with mocks.
- Run typecheck/build/lint where practical and fix regressions caused by the work.
