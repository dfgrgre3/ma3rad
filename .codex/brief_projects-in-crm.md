# Navigation update brief

## Objective
Move the Projects entry into the existing Arabic CRM and Customers mega menu. Remove the standalone Projects top-level navigation group so users find projects alongside customer relationship workflows.

## Scope
- Existing React/TypeScript application.
- Primary navigation source: `src/config/navigationGroups01.ts`.
- Preserve the existing `/projects` route, `Boxes` icon, Arabic label `إدارة المشاريع`, and `projects.view` permission.
- Add the project item to the existing `crm` group, preferably after the customer-facing entries or at the end of the group.
- Remove the standalone `projects` group from the navigation definitions.
- Do not alter routing, pages, permissions, or visual styling beyond the navigation data change.
- Preserve RTL/Arabic behavior and existing navigation ordering conventions.

## Verification
Run the narrowest relevant checks available (at least typecheck or build if practical) and report changed files.
