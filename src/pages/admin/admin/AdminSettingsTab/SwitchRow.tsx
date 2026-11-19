import React from 'react';

interface SwitchRowProps {
  checked: boolean;
  onToggle: () => void;
  title: string;
  description: string;
  containerClassName?: string;
  descriptionClassName?: string;
}

export const SwitchRow: React.FC<SwitchRowProps> = ({
  checked,
  onToggle,
  title,
  description,
  containerClassName,
  descriptionClassName,
}) => (
  <div className={['flex flex-row-reverse items-center justify-between gap-4', containerClassName].filter(Boolean).join(' ')}>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-0' : '-translate-x-5'
        }`}
      />
    </button>
    <div className="text-right">
      <div className="text-xs font-black text-slate-900 dark:text-slate-100">
        {title}
      </div>
      <div className={`text-[11px] text-slate-500 dark:text-slate-400 mt-0.5${descriptionClassName ? ` ${descriptionClassName}` : ''}`}>
        {description}
      </div>
    </div>
  </div>
);
