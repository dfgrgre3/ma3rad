import React from 'react';
import { useConfigText } from '../../hooks/useAppConfig';

export interface ConfigTextProps {
  k: string;
  fallback: string;
  as?: React.ElementType;
  className?: string;
}

/**
 * Renders an administrator-editable text value.
 * When no override exists the caller-provided fallback is shown verbatim.
 */
export const ConfigText: React.FC<ConfigTextProps> = ({
  k,
  fallback,
  as: Tag = 'span',
  className,
}) => {
  const value = useConfigText(k, fallback);
  return <Tag className={className}>{value}</Tag>;
};

export default ConfigText;
