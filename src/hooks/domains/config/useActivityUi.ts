import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { isActivityPathHidden } from '../../../config/activityPageVisibility';
import { isActivityControlHidden } from '../../../config/activityUiRules';
import {
  getActivityElementLabel,
  isActivityElementHidden,
  resolveActivityElements,
  resolveActivityElement,
  type ActivityElementState,
} from '../../../config/activityElementSpec';
import {
  getDocElementLabel,
  isDocElementHidden,
  resolveDocElement,
  resolveDocElements,
  type DocElementState,
} from '../../../config/activityDocumentSpec';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { useTheme } from '../../../contexts/useTheme';

/**
 * Activity-aware UI gates.
 *
 * - `useActivityPathHidden(path)` — true when the given route is hidden for the
 *   selected activity (same source as RouteGuard/NavigationService).
 * - `useActivityControlHidden(controlId)` — true when a control-level rule in
 *   `activityUiRules.ts` hides the element for the selected activity.
 * - `useActivityElement(elementId, path?)` — per-page element spec from
 *   `activityElementSpec.ts`: visibility + optional label override. `path`
 *   defaults to the current route.
 */
export function useActivityPathHidden(path: string): boolean {
  return isActivityPathHidden(path, getEffectiveBusinessType());
}

export function useActivityControlHidden(controlId: string): boolean {
  return isActivityControlHidden(controlId, getEffectiveBusinessType());
}

export function useActivityElementState(elementId: string, path?: string): ActivityElementState {
  useTheme();
  const { pathname } = useLocation();
  const resolvedPath = path ?? pathname;
  const businessType = getEffectiveBusinessType();
  return useMemo(
    () => resolveActivityElement(resolvedPath, elementId, businessType),
    [resolvedPath, elementId, businessType],
  );
}

/** True when `elementId` is hidden on `path` (defaults to current route). */
export function useActivityElementHidden(elementId: string, path?: string): boolean {
  return !useActivityElementState(elementId, path).visible;
}

/** Label override for `elementId` on `path`, or undefined for the default. */
export function useActivityElementLabel(elementId: string, path?: string): string | undefined {
  return useActivityElementState(elementId, path).label;
}

/** All element states declared for a path (defaults to current route). */
export function useActivityElements(path?: string): Record<string, ActivityElementState> {
  useTheme();
  const { pathname } = useLocation();
  const resolvedPath = path ?? pathname;
  const businessType = getEffectiveBusinessType();
  return useMemo(
    () => resolveActivityElements(resolvedPath, businessType),
    [resolvedPath, businessType],
  );
}

/**
 * Document-level activity gates (`activityDocumentSpec.ts`). `docPath` is a
 * synthetic key like `/doc/sales_invoice` — independent of the current route,
 * so the same rules apply wherever the document is rendered.
 */
export function useDocElementState(docPath: string, elementId: string): DocElementState {
  useTheme();
  const businessType = getEffectiveBusinessType();
  return useMemo(
    () => resolveDocElement(docPath, elementId, businessType),
    [docPath, elementId, businessType],
  );
}

/** True when `elementId` is hidden for this document type + activity. */
export function useDocElementHidden(docPath: string, elementId: string): boolean {
  return !useDocElementState(docPath, elementId).visible;
}

/** Label override for a document element, or undefined for the default. */
export function useDocElementLabel(docPath: string, elementId: string): string | undefined {
  return useDocElementState(docPath, elementId).label;
}

/** All element states declared for a document type. */
export function useDocElements(docPath: string): Record<string, DocElementState> {
  useTheme();
  const businessType = getEffectiveBusinessType();
  return useMemo(
    () => resolveDocElements(docPath, businessType),
    [docPath, businessType],
  );
}

// Re-exported for callers that prefer the non-hook API.
export { getActivityElementLabel, isActivityElementHidden, getDocElementLabel, isDocElementHidden };
