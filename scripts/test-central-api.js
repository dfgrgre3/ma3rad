/**
 * Central API Integration Test
 * 
 * Run this in the Electron app's DevTools Console after starting the app:
 * 
 *   npm run electron:dev
 *   // Open DevTools (F12) -> Console tab
 *   // Paste and run this entire file
 * 
 * This tests the central license issuance flow via the Electron bridge.
 */

async function testCentralApi() {
  console.log('🧪 Testing Central API Integration\n');
  
  // Check if Electron bridge is available
  if (!window.ceramisys?.central?.request) {
    console.log('⚠️  Electron bridge (window.ceramisys.central) not available');
    console.log('   Ensure you are running inside the Electron app with DevTools open.');
    return;
  }

  console.log('✅ Electron bridge detected\n');
  const client = window.ceramisys.central;

  // Test 1: Health check
  try {
    console.log('Test 1: Central server health check...');
    const health = await client.request({
      path: '/api/v1/admin/health',
      method: 'GET'
    });
    console.log('  ✅ Health check passed:', health);
  } catch (err) {
    console.error('  ❌ Health check failed:', err.message);
  }

  // Test 2: List plans (read-only, safe)
  try {
    console.log('\nTest 2: List plans...');
    const plans = await client.request({
      path: '/api/v1/admin/plans',
      method: 'GET'
    });
    console.log(`  ✅ Found ${plans.length} plans`);
    plans.slice(0, 3).forEach(p => console.log(`     - ${p.name} (${p.code})`));
  } catch (err) {
    console.error('  ❌ List plans failed:', err.message);
  }

  // Test 3: Auth flow (requires credentials)
  console.log('\nTest 3: Admin auth (requires valid credentials)...');
  console.log('  Run manually: await client.login("admin", "your-password")');
  
  // Test 4: License issue (requires valid tenant/plan and auth)
  console.log('\nTest 4: License issue (requires auth + valid tenant/plan)...');
  console.log('  Expected endpoint: POST /api/v1/admin/licenses/issue');
  console.log('  Example payload:');
  console.log(JSON.stringify({
    tenantId: 'ten_xxx',
    planId: 'plan_xxx',
    action: 'ISSUE',
    months: 12,
    seats: 5,
    branchesLimit: 3,
    deviceLimit: 5,
    startsAt: new Date().toISOString(),
    offlineGracePeriodDays: 14,
    couplingMode: 'FULL',
    modules: ['sales', 'inventory'],
    features: ['advanced_reports'],
    hardwareId: null,
    notes: 'Test license from central'
  }, null, 2));

  // Test 5: Full flow example (after login)
  console.log('\n📋 Full Test Flow (run after login):');
  console.log('─'.repeat(50));
  console.log(`
// 1. Login
const auth = await client.login("admin", "your-password");
console.log("Token:", auth.token);

// 2. Issue license
const license = await client.request({
  path: '/api/v1/admin/licenses/issue',
  method: 'POST',
  body: {
    tenantId: 'ten_xxx',
    planId: 'plan_xxx',
    action: 'ISSUE',
    months: 12,
    seats: 5,
    branchesLimit: 3,
    deviceLimit: 5,
    startsAt: new Date().toISOString(),
    offlineGracePeriodDays: 14,
    couplingMode: 'FULL',
    modules: ['sales', 'inventory'],
    features: ['advanced_reports'],
    hardwareId: null,
    notes: 'Test license'
  }
});
console.log("License issued:", license.license.licenseKey);
console.log("Certificate (Ed25519):", JSON.parse(license.license.certificate));

// 3. Renew license
const renewed = await client.request({
  path: '/api/v1/admin/licenses/' + encodeURIComponent(license.license.id) + '/renew',
  method: 'POST',
  body: { months: 12 }
});
console.log("Renewed:", renewed);

// 4. Suspend license
const suspended = await client.request({
  path: '/api/v1/admin/licenses/' + encodeURIComponent(license.license.id) + '/suspend',
  method: 'POST',
  body: { reason: 'Test suspension' }
});
console.log("Suspended:", suspended);

// 5. Revoke license
const revoked = await client.request({
  path: '/api/v1/admin/licenses/' + encodeURIComponent(license.license.id) + '/revoke',
  method: 'POST',
  body: { reason: 'Test revocation' }
});
console.log("Revoked:", revoked);
`);

  console.log('\n✅ Central API test guide ready');
  console.log('   Copy the "Full Test Flow" section to console after login');
}

// Auto-run if in Electron environment
if (typeof window !== 'undefined' && window.ceramisys?.central) {
  testCentralApi();
} else if (typeof module !== 'undefined') {
  module.exports = { testCentralApi };
}