require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const ed25519 = require('node-ed25519');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// Database connection
let db;
async function initDatabase() {
  db = await open({
    filename: process.env.CENTRAL_DB_PATH || './central.db',
    driver: sqlite3.Database
  });
  
  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON');
  
  // Create tables
  await createTables();
  
  // Generate or load Ed25519 key pair for license signing
  await initSigningKeys();
  
  console.log('Database initialized successfully');
}

async function createTables() {
  // Platform tenants
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_tenants (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      country TEXT,
      city TEXT,
      address TEXT,
      business_type TEXT,
      status TEXT NOT NULL DEFAULT 'TRIAL'
        CHECK(status IN ('TRIAL','ACTIVE','SUSPENDED','EXPIRED','CANCELLED')),
      plan_id TEXT,
      subscription_started_at TEXT,
      subscription_expires_at TEXT,
      seats_limit INTEGER NOT NULL DEFAULT 1,
      branches_limit INTEGER NOT NULL DEFAULT 1,
      devices_limit INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Platform plans
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_plans (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      billing_cycle TEXT NOT NULL DEFAULT 'YEARLY'
        CHECK(billing_cycle IN ('MONTHLY','QUARTERLY','YEARLY','LIFETIME')),
      price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EGP',
      seats_limit INTEGER NOT NULL DEFAULT 1,
      branches_limit INTEGER NOT NULL DEFAULT 1,
      devices_limit INTEGER NOT NULL DEFAULT 1,
      monthly_price REAL NOT NULL DEFAULT 0,
      yearly_price REAL NOT NULL DEFAULT 0,
      trial_days INTEGER NOT NULL DEFAULT 14,
      storage_limit_mb INTEGER NOT NULL DEFAULT 500,
      max_products INTEGER NOT NULL DEFAULT 1000,
      max_warehouses INTEGER NOT NULL DEFAULT 2,
      permissions TEXT NOT NULL DEFAULT '[]',
      included_modules TEXT NOT NULL DEFAULT '[]',
      features TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      offline_grace_period_days INTEGER NOT NULL DEFAULT 14,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Platform subscriptions
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK(status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      seats INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      billing_cycle TEXT NOT NULL DEFAULT 'YEARLY',
      auto_renew INTEGER NOT NULL DEFAULT 1 CHECK(auto_renew IN (0,1)),
      branches_limit INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
    );
  `);

  // Platform licenses
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_licenses (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      subscription_id TEXT,
      plan_id TEXT,
      license_key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK(status IN ('ISSUED','ACTIVE','SUSPENDED','REVOKED','EXPIRED')),
      issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      starts_at TEXT,
      activated_at TEXT,
      expires_at TEXT,
      seats INTEGER NOT NULL DEFAULT 1,
      device_limit INTEGER NOT NULL DEFAULT 1,
      branches_limit INTEGER NOT NULL DEFAULT 1,
      hardware_id TEXT,
      activation_code TEXT,
      certificate TEXT,
      transfer_count INTEGER NOT NULL DEFAULT 0,
      modules TEXT NOT NULL DEFAULT '[]',
      features TEXT NOT NULL DEFAULT '[]',
      offline_grace_period_days INTEGER,
      coupling_mode TEXT DEFAULT 'FULL' CHECK(coupling_mode IN ('FULL','EXPIRY_ONLY','NONE')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE SET NULL
    );
  `);

  // Platform license activations
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_license_activations (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      device_id TEXT,
      activation_code TEXT,
      mode TEXT NOT NULL DEFAULT 'ONLINE' CHECK(mode IN ('ONLINE','OFFLINE')),
      action TEXT NOT NULL CHECK(action IN ('ACTIVATE','DEACTIVATE','TRANSFER','RENEW','REVOKE')),
      status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS','FAILED','PENDING')),
      ip_address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
  `);

  // Platform devices
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_devices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      license_id TEXT,
      hardware_id TEXT NOT NULL,
      name TEXT,
      os TEXT,
      app_version TEXT,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','REVOKED','OFFLINE')),
      first_activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT,
      clone_suspected INTEGER NOT NULL DEFAULT 0 CHECK(clone_suspected IN (0,1)),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE SET NULL
    );
  `);

  // Platform license changes (audit)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_license_changes (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      subscription_id TEXT,
      change_type TEXT NOT NULL
        CHECK(change_type IN ('ISSUE','RENEW','SUSPEND','REVOKE','TRANSFER','MODULE_CHANGE','LIMIT_CHANGE','COUPLING_CHANGE','STATUS_CHANGE')),
      old_values TEXT,
      new_values TEXT,
      actor_id TEXT,
      actor_name TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE SET NULL
    );
  `);

  // Platform subscription changes (audit)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_subscription_changes (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      change_type TEXT NOT NULL
        CHECK(change_type IN ('CREATE','RENEW','SUSPEND','CANCEL','EXPIRE','PLAN_CHANGE','LIMIT_CHANGE','SEATS_CHANGE','BRANCHES_CHANGE')),
      old_values TEXT,
      new_values TEXT,
      actor_id TEXT,
      actor_name TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE CASCADE
    );
  `);

  // Platform admin accounts
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_admins (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ed25519 signing keys
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_signing_keys (
      id TEXT PRIMARY KEY,
      key_id TEXT UNIQUE NOT NULL,
      private_key TEXT NOT NULL,
      public_key TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT
    );
  `);

  // Create indexes
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_platform_tenants_status ON platform_tenants(status);
    CREATE INDEX IF NOT EXISTS idx_platform_tenants_expiry ON platform_tenants(subscription_expires_at);
    CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_tenant ON platform_subscriptions(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_end ON platform_subscriptions(end_date);
    CREATE INDEX IF NOT EXISTS idx_platform_licenses_tenant ON platform_licenses(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_platform_licenses_expiry ON platform_licenses(expires_at);
    CREATE INDEX IF NOT EXISTS idx_platform_license_activations_license ON platform_license_activations(license_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_license_activations_tenant ON platform_license_activations(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_devices_tenant ON platform_devices(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_platform_devices_hardware ON platform_devices(hardware_id);
    CREATE INDEX IF NOT EXISTS idx_platform_license_changes_license ON platform_license_changes(license_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_subscription_changes_sub ON platform_subscription_changes(subscription_id, created_at);
  `);

  console.log('Tables created successfully');
}

// Ed25519 signing keys management
let currentSigningKey = null;
let currentVerifyingKey = null;
let currentKeyId = null;

async function initSigningKeys() {
  const existing = await db.get('SELECT * FROM platform_signing_keys WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1');
  
  if (existing) {
    currentKeyId = existing.key_id;
    currentSigningKey = Buffer.from(existing.private_key, 'base64');
    currentVerifyingKey = Buffer.from(existing.public_key, 'base64');
    console.log('Loaded existing signing key:', currentKeyId);
  } else {
    // Generate new key pair
    const keyPair = ed25519.generateKeyPair();
    currentSigningKey = keyPair.privateKey;
    currentVerifyingKey = keyPair.publicKey;
    currentKeyId = `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    
    await db.run(
      `INSERT INTO platform_signing_keys (id, key_id, private_key, public_key, is_active) VALUES (?, ?, ?, ?, 1)`,
      [currentKeyId, currentKeyId, currentSigningKey.toString('base64'), currentVerifyingKey.toString('base64')]
    );
    console.log('Generated new signing key:', currentKeyId);
  }
  
  console.log('Public key (base64):', currentVerifyingKey.toString('base64'));
}

function signCertificate(payload) {
  const body = JSON.stringify(payload);
  const signature = ed25519.sign(Buffer.from(body), currentSigningKey);
  return {
    payload,
    signature: signature.toString('base64'),
    key_id: currentKeyId
  };
}

function verifyCertificate(certificate, publicKey = currentVerifyingKey) {
  const body = JSON.stringify(certificate.payload);
  return ed25519.verify(Buffer.from(body), Buffer.from(certificate.signature, 'base64'), publicKey);
}

function generateLicenseKey() {
  const block = () => uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `CS-${block()}-${block()}-${block()}-${block()}`;
}

function generateActivationCode() {
  const block = () => uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${block()}-${block()}-${block()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addMonths(date, months) {
  const result = new Date(date.getTime());
  const targetMonth = result.getMonth() + months;
  const day = result.getDate();
  result.setMonth(targetMonth);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

// Authentication middleware
async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.slice(7);
  // In production, validate JWT or session token
  // For now, check against a simple admin token or database
  const admin = await db.get('SELECT * FROM platform_admins WHERE id = ? AND is_active = 1', [token]);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
  
  req.admin = admin;
  next();
}

// ============ API Routes ============

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: nowIso() });
});

// Get public key for license verification
app.get('/api/v1/configuration/public-key', (req, res) => {
  res.json({ 
    publicKey: currentVerifyingKey.toString('base64'),
    keyId: currentKeyId
  });
});

// ============ Tenant Management ============
app.get('/api/v1/admin/tenants', authenticateAdmin, async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    let sql = 'SELECT * FROM platform_tenants WHERE 1=1';
    const params = [];
    
    if (search) {
      sql += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC';
    const tenants = await db.all(sql, params);
    res.json(tenants);
  } catch (err) {
    console.error('Error listing tenants:', err);
    res.status(500).json({ error: 'Failed to list tenants' });
  }
});

app.post('/api/v1/admin/tenants', authenticateAdmin, async (req, res) => {
  try {
    const { name, code, contactName, email, phone, country, city, address, businessType } = req.body;
    
    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }
    
    const id = `tenant_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const tenantCode = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    
    const existing = await db.get('SELECT 1 FROM platform_tenants WHERE code = ?', [tenantCode]);
    if (existing) {
      return res.status(400).json({ error: 'Tenant code already exists' });
    }
    
    await db.run(
      `INSERT INTO platform_tenants (id, code, name, contact_name, email, phone, country, city, address, business_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tenantCode, name.trim(), contactName, email, phone, country, city, address, businessType]
    );
    
    const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
    res.status(201).json(tenant);
  } catch (err) {
    console.error('Error creating tenant:', err);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// ============ Plan Management ============
app.get('/api/v1/admin/plans', authenticateAdmin, async (req, res) => {
  try {
    const plans = await db.all('SELECT * FROM platform_plans ORDER BY sort_order, price');
    res.json(plans);
  } catch (err) {
    console.error('Error listing plans:', err);
    res.status(500).json({ error: 'Failed to list plans' });
  }
});

// ============ License Management ============
app.get('/api/v1/admin/licenses', authenticateAdmin, async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    let sql = `
      SELECT l.*, t.name AS tenantName, p.name AS planName
      FROM platform_licenses l
      JOIN platform_tenants t ON t.id = l.tenant_id
      LEFT JOIN platform_plans p ON p.id = l.plan_id
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      sql += ' AND (t.name LIKE ? OR l.license_key LIKE ? OR COALESCE(l.hardware_id,\'\') LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      sql += ' AND l.status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY l.created_at DESC';
    const licenses = await db.all(sql, params);
    res.json(licenses);
  } catch (err) {
    console.error('Error listing licenses:', err);
    res.status(500).json({ error: 'Failed to list licenses' });
  }
});

// Issue license (central-only)
app.post('/api/v1/admin/licenses/issue', authenticateAdmin, async (req, res) => {
  try {
    const {
      tenantId,
      planId,
      action = 'ISSUE',
      months = 12,
      seats,
      branchesLimit,
      deviceLimit,
      startsAt,
      expiresAt,
      offlineGracePeriodDays,
      couplingMode = 'FULL',
      modules,
      features,
      hardwareId,
      notes
    } = req.body;
    
    if (!tenantId || !planId) {
      return res.status(400).json({ error: 'tenantId and planId are required' });
    }
    
    // Verify tenant and plan exist
    const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [tenantId]);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    
    const plan = await db.get('SELECT * FROM platform_plans WHERE id = ?', [planId]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    
    const start = startsAt ? new Date(startsAt) : new Date();
    const expires = expiresAt ? new Date(expiresAt) : (plan.billing_cycle === 'LIFETIME' ? null : addMonths(start, months));
    const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseKey = generateLicenseKey();
    const activationCode = generateActivationCode();
    const finalSeats = Math.max(1, seats || plan.seats_limit);
    const finalBranchesLimit = Math.max(1, branchesLimit || plan.branches_limit);
    const finalDeviceLimit = Math.max(1, deviceLimit || plan.devices_limit);
    const finalOfflineGracePeriodDays = offlineGracePeriodDays || plan.offline_grace_period_days;
    const finalModules = modules || JSON.parse(plan.included_modules);
    const finalFeatures = features || JSON.parse(plan.features);
    
    const certificate = signCertificate({
      licenseKey,
      tenantId,
      planId,
      issuedAt: start.toISOString(),
      expiresAt: expires?.toISOString() ?? null,
      deviceLimit: finalDeviceLimit,
      seats: finalSeats,
      branchesLimit: finalBranchesLimit,
      offlineGracePeriodDays: finalOfflineGracePeriodDays,
      licenseType: plan.billing_cycle === 'LIFETIME' ? 'perpetual' : (plan.billing_cycle === 'YEARLY' ? 'annual' : 'monthly')
    });
    
    await db.exec('BEGIN TRANSACTION');
    try {
      // Create subscription
      await db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, 1, ?)`,
        [subscriptionId, tenantId, planId, start.toISOString(), expires?.toISOString() ?? null, finalSeats, plan.price, plan.billing_cycle, finalBranchesLimit]
      );
      
      // Create license
      await db.run(
        `INSERT INTO platform_licenses
          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
           seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
          VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          licenseId, tenantId, subscriptionId, planId, licenseKey,
          start.toISOString(), start.toISOString(), expires?.toISOString() ?? null,
          finalSeats, finalDeviceLimit, finalBranchesLimit,
          JSON.stringify(finalModules), JSON.stringify(finalFeatures),
          activationCode, JSON.stringify(certificate),
          finalOfflineGracePeriodDays, couplingMode, notes
        ]
      );
      
      // Update tenant
      await db.run(
        `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
           subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
         WHERE id = ?`,
        [planId, start.toISOString(), expires?.toISOString() ?? null, finalSeats, finalBranchesLimit, finalDeviceLimit, nowIso(), tenantId]
      );
      
      // Record activation
      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'ACTIVATE', 'SUCCESS', ?)`,
        [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, licenseId, tenantId, hardwareId || null, activationCode, 'إصدار ترخيص من الخادم المركزي']
      );
      
      // Record license change
      await db.run(
        `INSERT INTO platform_license_changes
          (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
         VALUES (?, ?, ?, 'ISSUE', NULL, ?, ?, ?, ?)`,
        [`lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, licenseId, subscriptionId,
         JSON.stringify({ licenseKey, tenantId, planId, startsAt: start.toISOString(), expiresAt: expires?.toISOString() ?? null,
           seats: finalSeats, deviceLimit: finalDeviceLimit, branchesLimit: finalBranchesLimit, modules: finalModules, features: finalFeatures,
           offlineGracePeriodDays: finalOfflineGracePeriodDays, couplingMode }),
         req.admin.id, req.admin.full_name, `إصدار ترخيص جديد من الخادم المركزي`]
      );
      
      await db.exec('COMMIT');
      
      const license = await db.get(`
        SELECT l.*, t.name AS tenantName, p.name AS planName
        FROM platform_licenses l
        JOIN platform_tenants t ON t.id = l.tenant_id
        LEFT JOIN platform_plans p ON p.id = l.plan_id
        WHERE l.id = ?
      `, [licenseId]);
      
      res.status(201).json({
        license: {
          ...license,
          certificate: JSON.parse(license.certificate)
        },
        subscription: {
          id: subscriptionId,
          planId,
          status: 'ACTIVE',
          startDate: start.toISOString(),
          endDate: expires?.toISOString() ?? null,
          seats: finalSeats,
          price: plan.price,
          billingCycle: plan.billing_cycle,
          branchesLimit: finalBranchesLimit
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          code: tenant.code,
          status: 'ACTIVE'
        }
      });
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error issuing license:', err);
    res.status(500).json({ error: 'Failed to issue license', details: err.message });
  }
});

// Renew license
app.post('/api/v1/admin/licenses/:id/renew', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { months = 12 } = req.body;
    
    const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
    if (!license) return res.status(404).json({ error: 'License not found' });
    
    const base = license.expires_at && new Date(license.expires_at) > new Date()
      ? new Date(license.expires_at)
      : new Date();
    const expires = addMonths(base, Math.max(1, months));
    const coupling = license.coupling_mode || 'FULL';
    
    await db.exec('BEGIN TRANSACTION');
    try {
      await db.run(
        `UPDATE platform_licenses SET status = 'ACTIVE', expires_at = ?, updated_at = ? WHERE id = ?`,
        [expires.toISOString(), nowIso(), id]
      );
      
      if (coupling === 'FULL' || coupling === 'EXPIRY_ONLY') {
        if (license.subscription_id) {
          await db.run(
            `UPDATE platform_subscriptions SET status = 'ACTIVE', end_date = ?, updated_at = ? WHERE id = ?`,
            [expires.toISOString(), nowIso(), license.subscription_id]
          );
        }
        await db.run(
          `UPDATE platform_tenants SET status = 'ACTIVE', subscription_expires_at = ?, updated_at = ? WHERE id = ?`,
          [expires.toISOString(), nowIso(), license.tenant_id]
        );
      }
      
      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'RENEW', 'SUCCESS', ?)`,
        [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.tenant_id, license.hardware_id, license.activation_code, `تجديد ${months} شهر`]
      );
      
      await db.run(
        `INSERT INTO platform_license_changes
          (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
         VALUES (?, ?, ?, 'RENEW', ?, ?, ?, ?, ?)`,
        [`lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
         JSON.stringify({ expiresAt: license.expires_at }), JSON.stringify({ expiresAt: expires.toISOString() }),
         req.admin.id, req.admin.full_name, `تجديد ${months} شهر`]
      );
      
      await db.exec('COMMIT');
      
      const updated = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
      res.json({ license: updated, previousExpiresAt: license.expires_at, newExpiresAt: expires.toISOString() });
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error renewing license:', err);
    res.status(500).json({ error: 'Failed to renew license' });
  }
});

// Suspend license
app.post('/api/v1/admin/licenses/:id/suspend', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
    if (!license) return res.status(404).json({ error: 'License not found' });
    
    await db.run(
      `UPDATE platform_licenses SET status = 'SUSPENDED', updated_at = ? WHERE id = ?`,
      [nowIso(), id]
    );
    
    await db.run(
      `INSERT INTO platform_license_activations
        (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
       VALUES (?, ?, ?, ?, ?, 'ONLINE', 'DEACTIVATE', 'SUCCESS', ?)`,
      [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.tenant_id, license.hardware_id, license.activation_code, reason || 'إيقاف الترخيص من الخادم المركزي']
    );
    
    await db.run(
      `INSERT INTO platform_license_changes
        (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
       VALUES (?, ?, ?, 'SUSPEND', ?, ?, ?, ?, ?)`,
      [`lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
       JSON.stringify({ status: license.status }), JSON.stringify({ status: 'SUSPENDED' }),
       req.admin.id, req.admin.full_name, reason || 'إيقاف من الخادم المركزي']
    );
    
    res.json({ licenseId: id, status: 'SUSPENDED', suspendedAt: nowIso() });
  } catch (err) {
    console.error('Error suspending license:', err);
    res.status(500).json({ error: 'Failed to suspend license' });
  }
});

// Revoke license
app.post('/api/v1/admin/licenses/:id/revoke', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
    if (!license) return res.status(404).json({ error: 'License not found' });
    
    await db.run(
      `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ? WHERE id = ?`,
      [nowIso(), id]
    );
    
    await db.run(
      `INSERT INTO platform_license_activations
        (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
       VALUES (?, ?, ?, ?, ?, 'ONLINE', 'REVOKE', 'SUCCESS', ?)`,
      [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.tenant_id, license.hardware_id, license.activation_code, reason || 'إلغاء الترخيص من الخادم المركزي']
    );
    
    await db.run(
      `INSERT INTO platform_license_changes
        (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
       VALUES (?, ?, ?, 'REVOKE', ?, ?, ?, ?, ?)`,
      [`lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
       JSON.stringify({ status: license.status }), JSON.stringify({ status: 'REVOKED' }),
       req.admin.id, req.admin.full_name, reason || 'إلغاء من الخادم المركزي']
    );
    
    res.json({ licenseId: id, status: 'REVOKED', revokedAt: nowIso() });
  } catch (err) {
    console.error('Error revoking license:', err);
    res.status(500).json({ error: 'Failed to revoke license' });
  }
});

// Transfer license
app.post('/api/v1/admin/licenses/:id/transfer', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newHardwareId, reason } = req.body;
    
    if (!newHardwareId) {
      return res.status(400).json({ error: 'newHardwareId is required' });
    }
    
    const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
    if (!license) return res.status(404).json({ error: 'License not found' });
    
    await db.run(
      `UPDATE platform_licenses SET hardware_id = ?, transfer_count = transfer_count + 1, updated_at = ? WHERE id = ?`,
      [newHardwareId, nowIso(), id]
    );
    
    // Update device registry
    const device = await db.get('SELECT * FROM platform_devices WHERE license_id = ?', [id]);
    if (device) {
      await db.run(
        `UPDATE platform_devices SET hardware_id = ?, updated_at = ? WHERE id = ?`,
        [newHardwareId, nowIso(), device.id]
      );
    } else {
      await db.run(
        `INSERT INTO platform_devices
          (id, tenant_id, license_id, hardware_id, name, os, app_version, ip_address, first_activated_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`pdev_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.tenant_id, id, newHardwareId, null, null, null, null, nowIso(), nowIso()]
      );
    }
    
    await db.run(
      `INSERT INTO platform_license_activations
        (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
       VALUES (?, ?, ?, ?, ?, 'ONLINE', 'TRANSFER', 'SUCCESS', ?)`,
      [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.tenant_id, newHardwareId, license.activation_code, reason || 'نقل ترخيص إلى جهاز آخر']
    );
    
    await db.run(
      `INSERT INTO platform_license_changes
        (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
       VALUES (?, ?, ?, 'TRANSFER', ?, ?, ?, ?, ?)`,
      [`lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
       JSON.stringify({ hardwareId: license.hardware_id }), JSON.stringify({ hardwareId: newHardwareId }),
       req.admin.id, req.admin.full_name, reason || 'نقل ترخيص من الخادم المركزي']
    );
    
    const updated = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
    res.json({
      licenseId: id,
      previousHardwareId: license.hardware_id,
      newHardwareId,
      transferCount: updated.transfer_count
    });
  } catch (err) {
    console.error('Error transferring license:', err);
    res.status(500).json({ error: 'Failed to transfer license' });
  }
});

// Set license coupling mode
app.post('/api/v1/admin/licenses/:id/coupling', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { couplingMode } = req.body;
    
    if (!['FULL', 'EXPIRY_ONLY', 'NONE'].includes(couplingMode)) {
      return res.status(400).json({ error: 'Invalid coupling mode' });
    }
    
    const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [id]);
    if (!license) return res.status(404).json({ error: 'License not found' });
    
    const previousMode = license.coupling_mode || 'FULL';
    await db.run(
      `UPDATE platform_licenses SET coupling_mode = ?, updated_at = ? WHERE id = ?`,
      [couplingMode, nowIso(), id]
    );
    
    await db.run(
      `INSERT INTO platform_license_changes
        (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
       VALUES (?, ?, ?, 'COUPLING_CHANGE', ?, ?, ?, ?, ?)`,
      [`lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`, license.id, license.subscription_id,
       JSON.stringify({ couplingMode: previousMode }), JSON.stringify({ couplingMode }),
       req.admin.id, req.admin.full_name, 'تغيير وضع الربط بالاشتراك']
    );
    
    res.json({ licenseId: id, couplingMode, previousMode });
  } catch (err) {
    console.error('Error setting coupling mode:', err);
    res.status(500).json({ error: 'Failed to set coupling mode' });
  }
});

// ============ Device Management ============
app.get('/api/v1/admin/devices', authenticateAdmin, async (req, res) => {
  try {
    const { tenantId, status } = req.query;
    let sql = 'SELECT * FROM platform_devices WHERE 1=1';
    const params = [];
    
    if (tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY last_seen_at DESC, created_at DESC';
    const devices = await db.all(sql, params);
    res.json(devices);
  } catch (err) {
    console.error('Error listing devices:', err);
    res.status(500).json({ error: 'Failed to list devices' });
  }
});

app.post('/api/v1/admin/devices/:id/suspend', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    await db.run(
      `UPDATE platform_devices SET status = 'SUSPENDED', updated_at = ? WHERE id = ?`,
      [nowIso(), id]
    );
    
    if (device.license_id) {
      await db.run(
        `UPDATE platform_licenses SET status = 'SUSPENDED', updated_at = ? WHERE id = ? AND status = 'ACTIVE'`,
        [nowIso(), device.license_id]
      );
    }
    
    await db.run(
      `INSERT INTO platform_license_activations
        (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
       VALUES (?, ?, ?, ?, ?, 'ONLINE', 'DEACTIVATE', 'SUCCESS', ?)`,
      [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, device.license_id, device.tenant_id, device.hardware_id, device.license_id ? (await db.get('SELECT activation_code FROM platform_licenses WHERE id = ?', [device.license_id]))?.activation_code || null : null, reason || 'إيقاف الجهاز عن بُعد']
    );
    
    res.json({ deviceId: id, status: 'SUSPENDED', previousStatus: device.status });
  } catch (err) {
    console.error('Error suspending device:', err);
    res.status(500).json({ error: 'Failed to suspend device' });
  }
});

app.post('/api/v1/admin/devices/:id/release', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    if (device.license_id) {
      await db.run(
        `UPDATE platform_licenses SET hardware_id = NULL, activated_at = NULL, updated_at = ? WHERE id = ?`,
        [nowIso(), device.license_id]
      );
      
      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'DEACTIVATE', 'SUCCESS', ?)`,
        [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, device.license_id, device.tenant_id, device.hardware_id, (await db.get('SELECT activation_code FROM platform_licenses WHERE id = ?', [device.license_id]))?.activation_code || null, reason || 'تحرير الجهاز عن بُعد']
      );
    }
    
    await db.run(
      `UPDATE platform_devices SET status = 'OFFLINE', license_id = NULL, updated_at = ? WHERE id = ?`,
      [nowIso(), id]
    );
    
    res.json({ deviceId: id, status: 'OFFLINE', previousStatus: device.status });
  } catch (err) {
    console.error('Error releasing device:', err);
    res.status(500).json({ error: 'Failed to release device' });
  }
});

app.post('/api/v1/admin/devices/:id/revoke', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const device = await db.get('SELECT * FROM platform_devices WHERE id = ?', [id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    await db.run(
      `UPDATE platform_devices SET status = 'REVOKED', clone_suspected = 1, updated_at = ? WHERE id = ?`,
      [nowIso(), id]
    );
    
    if (device.license_id) {
      await db.run(
        `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ? WHERE id = ?`,
        [nowIso(), device.license_id]
      );
      
      await db.run(
        `INSERT INTO platform_license_activations
          (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
         VALUES (?, ?, ?, ?, ?, 'ONLINE', 'REVOKE', 'SUCCESS', ?)`,
        [`lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`, device.license_id, device.tenant_id, device.hardware_id, (await db.get('SELECT activation_code FROM platform_licenses WHERE id = ?', [device.license_id]))?.activation_code || null, reason || 'إلغاء الجهاز عن بُعد (اشتباه استنساخ)']
      );
    }
    
    res.json({ deviceId: id, status: 'REVOKED', previousStatus: device.status });
  } catch (err) {
    console.error('Error revoking device:', err);
    res.status(500).json({ error: 'Failed to revoke device' });
  }
});

app.post('/api/v1/admin/devices/detect-clones', authenticateAdmin, async (req, res) => {
  try {
    const alerts = [];
    const flaggedDevices = [];
    const flaggedLicenses = [];
    
    // 1. Same HWID registered to multiple tenants
    const duplicateHwids = await db.all(`
      SELECT hardware_id, COUNT(DISTINCT tenant_id) as tenant_count
      FROM platform_devices
      WHERE status IN ('ACTIVE', 'SUSPENDED')
      GROUP BY hardware_id
      HAVING tenant_count > 1
    `);
    
    for (const row of duplicateHwids) {
      const hwid = row.hardware_id;
      const devices = await db.all(
        `SELECT * FROM platform_devices WHERE hardware_id = ? AND status IN ('ACTIVE', 'SUSPENDED')`,
        [hwid]
      );
      for (const d of devices) {
        await db.run(
          `UPDATE platform_devices SET clone_suspected = 1, updated_at = ? WHERE id = ?`,
          [nowIso(), d.id]
        );
        flaggedDevices.push(d);
        alerts.push(`اشتباه استنساخ: بصمة العتاد ${hwid} مستخدمة على عدة عملاء`);
      }
    }
    
    // 2. Same license active on more devices than device_limit
    const overLimitLicenses = await db.all(`
      SELECT l.id, l.device_limit, COUNT(d.id) as active_device_count
      FROM platform_licenses l
      LEFT JOIN platform_devices d ON d.license_id = l.id AND d.status = 'ACTIVE'
      WHERE l.status = 'ACTIVE'
      GROUP BY l.id
      HAVING active_device_count > l.device_limit
    `);
    
    for (const row of overLimitLicenses) {
      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [row.id]);
      if (license) {
        flaggedLicenses.push(license);
        alerts.push(`تجاوز عدد الأجهزة: الترخيص ${license.license_key} مفعل على ${row.active_device_count} أجهزة والحد المسموح ${row.device_limit}`);
      }
    }
    
    // 3. Rapid HWID transfers
    const rapidTransfers = await db.all(`
      SELECT license_id, COUNT(*) as transfer_count
      FROM platform_license_activations
      WHERE action = 'TRANSFER' AND created_at > date('now', '-30 day')
      GROUP BY license_id
      HAVING transfer_count > 3
    `);
    
    for (const row of rapidTransfers) {
      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [row.license_id]);
      if (license) {
        alerts.push(`نقل سريع للترخيص: ${license.license_key} نُقل ${row.transfer_count} مرة خلال 30 يوماً`);
      }
    }
    
    // 4. Same license activated on multiple different HWIDs simultaneously
    const multiHwidLicenses = await db.all(`
      SELECT l.id, l.device_limit, COUNT(DISTINCT d.hardware_id) as distinct_hwids
      FROM platform_licenses l
      JOIN platform_devices d ON d.license_id = l.id AND d.status = 'ACTIVE'
      WHERE l.status = 'ACTIVE'
      GROUP BY l.id
      HAVING distinct_hwids > 1 AND l.device_limit = 1
    `);
    
    for (const row of multiHwidLicenses) {
      const license = await db.get('SELECT * FROM platform_licenses WHERE id = ?', [row.id]);
      if (license) {
        flaggedLicenses.push(license);
        alerts.push(`ترخيص فردي على أجهزة متعددة: ${license.license_key} مفعل على ${row.distinct_hwids} بصمات عتاد مختلفة`);
      }
    }
    
    res.json({ devices: flaggedDevices, licenses: flaggedLicenses, alerts });
  } catch (err) {
    console.error('Error detecting clones:', err);
    res.status(500).json({ error: 'Failed to detect clones' });
  }
});

// ============ Scheduled Jobs ============
async function checkExpiringLicensesAndSubscriptions() {
  console.log('Running scheduled check for expiring licenses and subscriptions...');
  
  const horizons = [1, 7, 14, 30];
  
  for (const days of horizons) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    
    // Expiring licenses
    const expiringLicenses = await db.all(`
      SELECT l.*, t.name AS tenantName, t.id AS tenantId
      FROM platform_licenses l
      JOIN platform_tenants t ON t.id = l.tenant_id
      WHERE l.status IN ('ACTIVE', 'ISSUED')
        AND l.expires_at IS NOT NULL
        AND date(l.expires_at) = date(?)
    `, [cutoffStr]);
    
    for (const lic of expiringLicenses) {
      console.log(`License expiring in ${days} days: ${lic.license_key} for tenant ${lic.tenantName}`);
      // In production, send notification via email/push/webhook
    }
    
    // Expiring subscriptions
    const expiringSubscriptions = await db.all(`
      SELECT s.*, t.name AS tenantName, t.id AS tenantId
      FROM platform_subscriptions s
      JOIN platform_tenants t ON t.id = s.tenant_id
      WHERE s.status IN ('ACTIVE', 'TRIAL')
        AND s.end_date IS NOT NULL
        AND date(s.end_date) = date(?)
    `, [cutoffStr]);
    
    for (const sub of expiringSubscriptions) {
      console.log(`Subscription expiring in ${days} days: ${sub.id} for tenant ${sub.tenantName}`);
    }
  }
  
  // Already expired
  const expiredLicenses = await db.all(`
    SELECT l.*, t.name AS tenantName
    FROM platform_licenses l
    JOIN platform_tenants t ON t.id = l.tenant_id
    WHERE l.status IN ('ACTIVE', 'ISSUED')
      AND l.expires_at IS NOT NULL
      AND date(l.expires_at) < date('now')
  `);
  
  for (const lic of expiredLicenses) {
    console.log(`License ALREADY EXPIRED: ${lic.license_key} for tenant ${lic.tenantName}`);
  }
  
  const expiredSubscriptions = await db.all(`
    SELECT s.*, t.name AS tenantName
    FROM platform_subscriptions s
    JOIN platform_tenants t ON t.id = s.tenant_id
    WHERE s.status IN ('ACTIVE', 'TRIAL')
      AND s.end_date IS NOT NULL
      AND date(s.end_date) < date('now')
  `);
  
  for (const sub of expiredSubscriptions) {
    console.log(`Subscription ALREADY EXPIRED: ${sub.id} for tenant ${sub.tenantName}`);
  }
  
  console.log('Scheduled check completed');
}

// Schedule to run daily at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  try {
    await checkExpiringLicensesAndSubscriptions();
  } catch (err) {
    console.error('Scheduled job failed:', err);
  }
});

// Also run on startup (for testing)
setTimeout(async () => {
  try {
    await checkExpiringLicensesAndSubscriptions();
  } catch (err) {
    console.error('Initial check failed:', err);
  }
}, 5000);

// ============ Start Server ============
async function start() {
  try {
    await initDatabase();
    
    // Create default admin if none exists
    const adminCount = await db.get('SELECT COUNT(*) as count FROM platform_admins');
    if (adminCount.count === 0) {
      const adminId = `admin_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const passwordHash = await bcrypt.hash('admin123', 10);
      await db.run(
        `INSERT INTO platform_admins (id, username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?, ?)`,
        [adminId, 'admin', passwordHash, 'System Administrator', 'admin@ceramisys.local', 'SUPER_ADMIN']
      );
      console.log('Created default admin: admin / admin123');
    }
    
    // Create default plan if none exists
    const planCount = await db.get('SELECT COUNT(*) as count FROM platform_plans');
    if (planCount.count === 0) {
      const planId = `plan_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
      await db.run(
        `INSERT INTO platform_plans
          (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency, seats_limit, branches_limit,
           devices_limit, storage_limit_mb, max_products, max_warehouses, trial_days, included_modules, features, permissions,
           offline_grace_period_days, is_active, is_default, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [planId, 'STANDARD', 'الخطة القياسية', 'خطة اشتراك قياسية للمعارض الصغيرة والمتوسطة', 'YEARLY', 5000, 500, 5000, 'EGP', 5, 3, 5, 1000, 10000, 5, 14, '["sales","inventory","pos"]', '["reports","dashboard"]', '[]', 14, 1, 1, 10]
      );
      console.log('Created default plan: STANDARD');
    }
    
    app.listen(PORT, () => {
      console.log(`Central server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/v1/health`);
      console.log(`Public key: ${currentVerifyingKey.toString('base64')}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

module.exports = { app, signCertificate, verifyCertificate, checkExpiringLicensesAndSubscriptions };