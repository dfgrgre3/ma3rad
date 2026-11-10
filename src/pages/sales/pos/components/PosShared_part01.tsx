import React from 'react';
import { RefreshCw } from 'lucide-react';

export const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500';

export const RotateCcwIcon: React.FC = () => <RefreshCw className="w-4 h-4" />;

export const hasFormControl = (node: React.ReactNode): boolean => {
  if (!node) return false;

  if (React.isValidElement(node)) {
    const type = node.type;
    const tagName = typeof type === 'string' ? type.toLowerCase() : '';
    if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return true;

    if (node.props && typeof node.props.children !== 'undefined') {
      return React.Children.toArray(node.props.children).some((child) => hasFormControl(child));
    }

    return false;
  }

  if (Array.isArray(node)) {
    return node.some((child) => hasFormControl(child));
  }

  return false;
};

export const addControlId = (node: React.ReactNode, id: string): React.ReactNode => {
  if (!node) return node;

  if (Array.isArray(node)) {
    return node.map((child) => addControlId(child, id));
  }

  if (!React.isValidElement(node)) return node;

  const type = node.type;
  const tagName = typeof type === 'string' ? type.toLowerCase() : '';
  const hasId = typeof (node.props as { id?: string } | undefined)?.id === 'string';

  if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
    if (hasId) return node;
    return React.cloneElement(node, { id } as Partial<{ id: string }>);
  }

  if (node.props && typeof node.props.children !== 'undefined') {
    const children = React.Children.map(node.props.children, (child) => addControlId(child, id));
    if (children === node.props.children) return node;
    return React.cloneElement(node, { children });
  }

  return node;
};
