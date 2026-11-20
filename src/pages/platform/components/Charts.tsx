import React from 'react';
import { Link } from 'react-router-dom';
import type { PlatformTimeSeriesPoint, PlatformMetricComparison } from '../../../services/domains/platform/platformTypes';

interface ChartProps {
  data: PlatformTimeSeriesPoint[];
  height?: number;
  color?: string;
  showArea?: boolean;
  showPoints?: boolean;
  yAxisFormatter?: (value: number) => string;
  className?: string;
  'aria-label'?: string;
}

function getMinMax(data: PlatformTimeSeriesPoint[], padding = 0.1) {
  if (data.length === 0) return { min: 0, max: 10 };
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return {
    min: Math.max(0, min - range * padding),
    max: max + range * padding,
  };
}

function getXPosition(index: number, total: number, width: number, padding = 40) {
  if (total <= 1) return width / 2;
  return padding + (index / (total - 1)) * (width - 2 * padding);
}

function getYPosition(value: number, min: number, max: number, height: number, padding = 30) {
  const range = max - min || 1;
  const normalized = (value - min) / range;
  return height - padding - normalized * (height - 2 * padding);
}

export const LineChart: React.FC<ChartProps> = ({
  data,
  height = 200,
  color = '#10b981',
  showArea = true,
  showPoints = true,
  yAxisFormatter = (v) => v.toLocaleString('ar-EG'),
  className = '',
  'aria-label': ariaLabel = 'مخطط بياني',
}) => {
  if (data.length === 0) {
    return (
      <div className={`w-full flex items-center justify-center rounded-lg bg-surface-muted ${className}`} style={{ height }} role="img" aria-label={ariaLabel}>
        <p className="text-muted text-sm">لا توجد بيانات للعرض</p>
      </div>
    );
  }

  const { min, max } = getMinMax(data);
  const width = 100; // Percentage-based, actual width from container
  const points = data.map((d, i) => ({
    x: getXPosition(i, data.length, width, 8),
    y: getYPosition(d.value, min, max, height, 24),
    value: d.value,
    label: d.label,
  }));

  const areaPath = [
    `M ${points[0].x} ${height - 24}`,
    ...points.map((p) => `L ${p.x} ${p.y}`),
    `L ${points[points.length - 1].x} ${height - 24}`,
    'Z',
  ].join(' ');

  const linePath = [
    `M ${points[0].x} ${points[0].y}`,
    ...points.slice(1).map((p) => `L ${p.x} ${p.y}`),
  ].join(' ');

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => max - (i * (max - min)) / yTicks);

  // preserveAspectRatio="none" stretches the SVG to fill the container, which
  // would distort any <text> inside it — so axis labels are rendered as an
  // HTML overlay positioned by percentage instead.
  return (
    <div className={`relative w-full ${className}`} style={{ height }} role="img" aria-label={ariaLabel}>
      <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Y-axis grid lines */}
        <g stroke="#e2e8f0" stroke-width="0.5">
          {yTickValues.map((val, i) => {
            const y = getYPosition(val, min, max, height, 24);
            return (
              <line key={i} x1="6" y1={y} x2={width - 2} y2={y} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            );
          })}
        </g>

        {/* Area */}
        {showArea && (
          <path
            d={areaPath}
            fill={color}
            fillOpacity="0.1"
            stroke="none"
          />
        )}

        {/* Line */}
        <path
          d={linePath}
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Points */}
        {showPoints &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={color}
              stroke="white"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>

      {/* Y-axis labels (HTML overlay — undistorted) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {yTickValues.map((val, i) => {
          const y = getYPosition(val, min, max, height, 24);
          return (
            <span
              key={i}
              className="absolute text-[9px] font-medium text-muted"
              style={{ top: `${(y / height) * 100}%`, insetInlineStart: 2, transform: 'translateY(-50%)' }}
            >
              {yAxisFormatter(val)}
            </span>
          );
        })}
        {/* X-axis labels */}
        {points.map((p, i) => (
          <span
            key={i}
            className="absolute text-[9px] font-medium text-muted whitespace-nowrap"
            style={{
              top: `${((height - 8) / height) * 100}%`,
              insetInlineStart: `${(p.x / width) * 100}%`,
              transform: 'translateX(-50%) rotate(-30deg)',
              transformOrigin: 'top center',
            }}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export const DonutChart: React.FC<{
  data: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
  'aria-label'?: string;
}> = ({
  data,
  size = 180,
  thickness = 22,
  centerLabel,
  centerValue,
  className = '',
  'aria-label': ariaLabel = 'مخطط دائري',
}) => {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((acc, d) => acc + Math.max(0, d.value), 0);

  if (total <= 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-surface-muted ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label={ariaLabel}
      >
        <p className="text-muted text-xs">لا توجد بيانات</p>
      </div>
    );
  }

  let offset = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = d.value / total;
      const dash = fraction * circumference;
      const segment = { ...d, dash, offset };
      offset += dash;
      return segment;
    });

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
        {segments.map((seg, i) => (
          <circle
            key={`${seg.label}-${i}`}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
          >
            <title>{`${seg.label}: ${seg.value}`}</title>
          </circle>
        ))}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && <span className="text-lg font-black text-ink">{centerValue}</span>}
          {centerLabel && <span className="text-[10px] font-semibold text-muted">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
};

const TONE_STYLES = {
  default: { icon: 'bg-surface-sunken text-ink-secondary', border: 'border-line' },
  success: { icon: 'bg-success-soft text-success', border: 'border-success-border' },
  warning: { icon: 'bg-warning-soft text-warning', border: 'border-warning-border' },
  danger: { icon: 'bg-danger-soft text-danger', border: 'border-danger-border' },
  info: { icon: 'bg-accent-soft text-primary', border: 'border-accent-border' },
  violet: { icon: 'bg-accent-soft text-primary', border: 'border-accent-border' },
} as const;

type Tone = keyof typeof TONE_STYLES;

export const MetricCard: React.FC<{
  label: string;
  value: string | number | React.ReactNode;
  comparison?: PlatformMetricComparison;
  icon?: React.ReactNode;
  iconColor?: string;
  trend?: 'up' | 'down' | 'flat';
  tone?: Tone;
  className?: string;
  onClick?: () => void;
}> = ({ label, value, comparison, icon, iconColor = '#10b981', trend, tone = 'default', className = '', onClick }) => {
  const isClickable = typeof onClick === 'function';
  const toneStyle = TONE_STYLES[tone];

  return (
    <div
      className={`rounded-xl border ${toneStyle.border} bg-surface p-4 shadow-sm transition ${isClickable ? 'hover:border-success hover:shadow cursor-pointer' : 'hover:border-line-strong hover:shadow'} ${className}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault(); // Space would otherwise scroll the page.
          onClick?.();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-muted">{label}</p>
          <p className="mt-1 truncate text-[22px] font-black leading-tight text-ink">
            {typeof value === 'number' ? value.toLocaleString('ar-EG') : value}
          </p>
          {comparison && (
            <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                  comparison.trend === 'up'
                    ? 'bg-success-soft text-success'
                    : comparison.trend === 'down'
                    ? 'bg-danger-soft text-danger'
                    : 'bg-surface-sunken text-ink-secondary'
                }`}
              >
                {comparison.trend === 'up' && <span className="h-2.5 w-2.5">▲</span>}
                {comparison.trend === 'down' && <span className="h-2.5 w-2.5">▼</span>}
                {comparison.trend === 'flat' && <span className="h-2.5 w-2.5">■</span>}
                <span>{comparison.changePercent >= 0 ? '+' : ''}{comparison.changePercent.toFixed(1)}%</span>
                <span className="text-muted">vs الفترة السابقة</span>
              </span>
            </div>
          )}
        </div>
        {icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneStyle.icon}`}>
            {icon}
          </span>
        )}
      </div>
    </div>
  );
};

const GRID_COLUMNS: Record<1 | 2 | 3 | 4, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
};

export const StatGrid: React.FC<{
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}> = ({ children, columns = 4, className = '' }) => (
  <div
    className={`grid gap-3 sm:grid-cols-2 ${GRID_COLUMNS[columns]} ${className}`}
    role="list"
  >
    {children}
  </div>
);

export const Panel: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconClass?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon, iconClass = 'bg-surface-sunken text-ink-secondary', action, children, className = '' }) => (
  <section className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}>
    <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-ink">{title}</h3>
          {subtitle && <p className="truncate text-[10.5px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
    <div className="p-4">{children}</div>
  </section>
);

export const PeriodSelector: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
  className?: string;
}> = ({ value, onChange, options, className = '' }) => {
  const defaultOptions = [
    { value: '7d', label: '7 أيام' },
    { value: '30d', label: '30 يوم' },
    { value: '90d', label: '90 يوم' },
    { value: '180d', label: '180 يوم' },
    { value: '365d', label: '365 يوم' },
    { value: 'ytd', label: 'منذ أول السنة' },
    { value: 'all', label: 'الكل' },
  ];

  const opts = options || defaultOptions;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-success/40 ${className}`}
      aria-label="اختر الفترة الزمنية"
    >
      {opts.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export const DrillDownLink: React.FC<{
  label: string;
  href: string;
  icon?: React.ReactNode;
  count?: number;
  className?: string;
}> = ({ label, href, icon, count, className = '' }) => (
  <Link
    to={href}
    className={`inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[11.5px] font-semibold text-ink hover:border-success hover:bg-success-soft transition ${className}`}
  >
    {icon}
    {label}
    {count !== undefined && (
      <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-success-soft text-success text-[10px] font-bold">
        {count}
      </span>
    )}
  </Link>
);

export const AlertCard: React.FC<{
  alert: {
    id: string;
    severity: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    description: string;
    link?: string;
    entityType?: string;
    entityId?: string;
    actionRequired?: boolean;
    suggestedActions?: string[];
  };
  onAction?: (alertId: string, action: string) => void;
}> = ({ alert, onAction }) => {
  const severityStyles = {
    danger: { wrap: 'border-danger-border bg-danger-soft', icon: 'bg-danger-soft text-danger', title: 'text-danger', text: 'text-danger', action: 'bg-danger-soft text-danger hover:bg-danger' },
    warning: { wrap: 'border-warning-border bg-warning-soft', icon: 'bg-warning-soft text-warning', title: 'text-warning', text: 'text-warning', action: 'bg-warning-soft text-warning hover:bg-warning' },
    info: { wrap: 'border-accent-border bg-accent-soft', icon: 'bg-accent-soft text-primary', title: 'text-primary', text: 'text-primary', action: 'bg-accent-soft text-primary hover:bg-accent-border' },
    success: { wrap: 'border-success-border bg-success-soft', icon: 'bg-success-soft text-success', title: 'text-success', text: 'text-success', action: 'bg-success-soft text-success hover:bg-success' },
  };

  const style = severityStyles[alert.severity] ?? severityStyles.info;
  const AlertIcon = alert.severity === 'danger' ? (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
  ) : alert.severity === 'warning' ? (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  ) : alert.severity === 'info' ? (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
  ) : (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
  );

  return (
    <div className={`flex h-full items-start gap-3 rounded-lg border p-3 transition hover:shadow-sm ${style.wrap}`}>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.icon}`}>
        {AlertIcon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[12px] font-bold ${style.title}`}>{alert.title}</p>
          {alert.actionRequired && (
            <span className="shrink-0 rounded-full bg-danger-soft px-1.5 py-0.5 text-[9px] font-bold text-danger">يتطلب إجراء</span>
          )}
        </div>
        <p className={`mt-0.5 text-[10.5px] leading-5 ${style.text}`}>{alert.description}</p>
        {alert.suggestedActions && alert.suggestedActions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {alert.suggestedActions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onAction?.(alert.id, action)}
                className={`text-[10px] font-semibold px-2 py-1 rounded ${style.action}`}
              >
                {action}
              </button>
            ))}
          </div>
        )}
        {alert.link && !onAction && (
          <Link to={alert.link} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-success hover:underline">
            عرض التفاصيل
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </Link>
        )}
      </div>
    </div>
  );
};