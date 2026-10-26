import React from 'react';
import { RefreshCw, X } from 'lucide-react';

export const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500';

export const RotateCcwIcon: React.FC = () => <RefreshCw className="w-4 h-4" />;

const hasFormControl = (node: React.ReactNode): boolean => {
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

const addControlId = (node: React.ReactNode, id: string): React.ReactNode => {
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

export const Field: React.FC<{ label: string; id?: string; children: React.ReactNode }> = ({ label, id, children }) => {
  const controlId = id || `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const hasControl = hasFormControl(children);
  const fieldChildren = hasControl ? addControlId(children, controlId) : children;

  if (!hasControl) {
    return (
      <div className="block">
        <span className="block text-[11px] font-bold text-slate-500 mb-1">{label}</span>
        {fieldChildren}
      </div>
    );
  }

  return (
    <label htmlFor={controlId} className="block">
      <span className="block text-[11px] font-bold text-slate-500 mb-1">{label}</span>
      {fieldChildren}
    </label>
  );
};

export const Modal: React.FC<{
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, icon, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      aria-label="Close dialog"
      className="absolute inset-0 h-full w-full border-0 bg-white p-0 backdrop-blur-sm"
      onClick={onClose}
    />
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="relative bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
    >
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sky-600">
          {icon}
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close dialog" className="text-slate-500 hover:text-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);
