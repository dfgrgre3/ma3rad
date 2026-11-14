const fs = require('fs');
const path = 'D:\\edarty\\ma3rad\\src\\services\\domains\\platform\\PlatformAdminService.ts';
let content = fs.readFileSync(path, 'utf8');

const lines = content.split('\n');
// Lines 1719-1740 (1-indexed) = indices 1718-1739 (0-indexed)
const startIdx = 1718;
const endIdx = 1739;

const replacement = [
  '      this.db.run(',
  '        `INSERT INTO platform_licenses',
  '          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,',
  '           seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)',
  '          VALUES (?, ?, ?, ?, ?, \'ACTIVE\', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`',
  '        [',
  '          licenseId,',
  '          tenantId,',
  '          subscriptionId,',
  '          planId,',
  '          licenseKey,',
  '          startsAt.toISOString(),',
  '          startsAt.toISOString(),',
  '          expires?.toISOString() ?? null,',
  '          seats,',
  '          toNumber(plan.devicesLimit, 1),',
  '          branchesLimit,',
  '          plan.includedModules,',
  '          plan.features,',
  '          activationCode,',
  '          certificate,',
  '          offlineGracePeriodDays,',
  '          couplingMode,',
  '          options.notes?.trim() || null,',
  '        ]',
  '      );'
];

const newLines = [];
for (let i = 0; i < lines.length; i++) {
  if (i === startIdx) {
    newLines.push(...replacement);
  }
  if (i < startIdx || i > endIdx) {
    newLines.push(lines[i]);
  }
}

fs.writeFileSync(path, newLines.join('\n'), 'utf8');
console.log('Done replacing lines 1719-1740');
