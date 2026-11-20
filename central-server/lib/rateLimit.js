'use strict';

const { getDb } = require('./db');

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const LOGIN_WINDOW_MINUTES = envInt('LOGIN_RATE_LIMIT_WINDOW_MINUTES', 15);
const LOGIN_IP_MAX_FAILURES = envInt('LOGIN_RATE_LIMIT_IP_MAX', 30);
const LOGIN_USERNAME_MAX_FAILURES = envInt('LOGIN_RATE_LIMIT_USERNAME_MAX', 10);
const MFA_WINDOW_MINUTES = envInt('MFA_RATE_LIMIT_WINDOW_MINUTES', 15);
const MFA_MAX_FAILURES = envInt('MFA_RATE_LIMIT_MAX', 5);
// Device-activation attempts verify tenant account credentials before any
// device credential exists, so they get their own counters — scoped by
// failure_reason so they never interfere with platform staff logins.
const ACTIVATION_IP_MAX_FAILURES = envInt('ACTIVATION_RATE_LIMIT_IP_MAX', 30);
const ACTIVATION_USERNAME_MAX_FAILURES = envInt('ACTIVATION_RATE_LIMIT_USERNAME_MAX', 10);

/**
 * Count failed login attempts recorded in platform_login_attempts within a
 * sliding window. At least one scope filter (ipAddress and/or username) is
 * required so the query never degrades into a full-table scan per request.
 */
async function countRecentFailures({ ipAddress = null, username = null, failureReasons = null, windowMinutes } = {}) {
  if (!ipAddress && !username) return 0;
  const db = getDb();
  const clauses = ['success = 0', "created_at >= datetime('now', ?)"];
  const params = [`-${Math.max(1, windowMinutes)} minutes`];
  if (ipAddress) {
    clauses.push('ip_address = ?');
    params.push(String(ipAddress));
  }
  if (username) {
    clauses.push('username = ?');
    params.push(String(username));
  }
  if (Array.isArray(failureReasons) && failureReasons.length > 0) {
    clauses.push(`failure_reason IN (${failureReasons.map(() => '?').join(', ')})`);
    params.push(...failureReasons);
  }
  const row = await db.get(
    `SELECT COUNT(*) AS c FROM platform_login_attempts WHERE ${clauses.join(' AND ')}`,
    params
  );
  return Number(row?.c || 0);
}

/** MFA brute-force guard: independent counter scoped to user + IP. */
async function countRecentMfaFailures({ username, ipAddress }) {
  return countRecentFailures({
    username,
    ipAddress,
    failureReasons: ['MFA_INVALID'],
    windowMinutes: MFA_WINDOW_MINUTES,
  });
}

module.exports = {
  countRecentFailures,
  countRecentMfaFailures,
  LOGIN_WINDOW_MINUTES,
  LOGIN_IP_MAX_FAILURES,
  LOGIN_USERNAME_MAX_FAILURES,
  MFA_WINDOW_MINUTES,
  MFA_MAX_FAILURES,
  ACTIVATION_IP_MAX_FAILURES,
  ACTIVATION_USERNAME_MAX_FAILURES,
};
