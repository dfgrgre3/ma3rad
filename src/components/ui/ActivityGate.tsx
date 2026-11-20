import React from 'react';
import { useActivityControlHidden, useActivityElementHidden, useActivityPathHidden } from '../../hooks/domains/config/useActivityUi';

interface ActivityGateBaseProps {
  children: React.ReactNode;
}

interface ActivityGatePathProps extends ActivityGateBaseProps {
  /** Hide children when this route is hidden for the selected activity. */
  path: string;
  control?: never;
  element?: never;
}

interface ActivityGateControlProps extends ActivityGateBaseProps {
  /** Hide children when this control id is hidden for the selected activity. */
  control: string;
  path?: never;
  element?: never;
}

interface ActivityGateElementProps extends ActivityGateBaseProps {
  /**
   * Hide children when this element id is hidden on the current route
   * (per-page rules in `activityElementSpec.ts`).
   */
  element: string;
  /** Optional explicit path; defaults to the current route. */
  atPath?: string;
  path?: never;
  control?: never;
}

type ActivityGateProps = ActivityGatePathProps | ActivityGateControlProps | ActivityGateElementProps;

/**
 * Renders children only when the activity keeps the referenced page/control/
 * element visible. Use for in-page buttons/actions whose target page may be
 * hidden (e.g. POS shortcut, barcode printing, promotions) or whose element
 * rule in `activityElementSpec.ts` hides it for the selected activity.
 */
export const ActivityGate: React.FC<ActivityGateProps> = (props) => {
  if ('element' in props && props.element !== undefined) {
    return <ActivityElementGate element={props.element} atPath={props.atPath}>{props.children}</ActivityElementGate>;
  }
  const routeProps = props as { path?: string; control?: string };
  return <ActivityRouteGate path={routeProps.path} control={routeProps.control}>{props.children}</ActivityRouteGate>;
};

const ActivityElementGate: React.FC<{ element: string; atPath?: string; children: React.ReactNode }> = ({ element, atPath, children }) => {
  const hidden = useActivityElementHidden(element, atPath);
  if (hidden) return null;
  return <>{children}</>;
};

const ActivityRouteGate: React.FC<{ path?: string; control?: string; children: React.ReactNode }> = ({ path, control, children }) => {
  const pathHidden = useActivityPathHidden(path ?? '');
  const controlHidden = useActivityControlHidden(control ?? '');
  const hidden = (path !== undefined && pathHidden) || (control !== undefined && controlHidden);
  if (hidden) return null;
  return <>{children}</>;
};

export default ActivityGate;
