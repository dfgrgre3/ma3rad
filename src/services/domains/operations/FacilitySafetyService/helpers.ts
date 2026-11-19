import type { Impact, Probability, RiskLevel } from './types';

const _MAX_DATE = '9999-12-31';

const RISK_SCORE_MAP: Record<string, Record<string, number>> = {
  RARE: { INSIGNIFICANT: 1, MINOR: 2, MODERATE: 3, MAJOR: 4, CATASTROPHIC: 5 },
  UNLIKELY: { INSIGNIFICANT: 2, MINOR: 4, MODERATE: 6, MAJOR: 8, CATASTROPHIC: 10 },
  POSSIBLE: { INSIGNIFICANT: 3, MINOR: 6, MODERATE: 9, MAJOR: 12, CATASTROPHIC: 15 },
  LIKELY: { INSIGNIFICANT: 4, MINOR: 8, MODERATE: 12, MAJOR: 16, CATASTROPHIC: 20 },
  ALMOST_CERTAIN: { INSIGNIFICANT: 5, MINOR: 10, MODERATE: 15, MAJOR: 20, CATASTROPHIC: 25 },
};

export function computeRiskScore(probability: Probability, impact: Impact): number {
  return RISK_SCORE_MAP[probability]?.[impact] ?? 0;
}

export function computeRiskLevel(score: number): RiskLevel {
  if (score >= 15) return 'CRITICAL';
  if (score >= 8) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

export function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function _roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}
