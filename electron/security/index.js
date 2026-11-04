// electron/security/index.js
// Central export for Electron security subsystem.
const crypto = require('./crypto');
const licenseValidator = require('./licenseValidator');
const fileIntegrity = require('./fileIntegrity');
const ipcGuard = require('./ipcGuard');
const auditLogger = require('./auditLogger');
const originalSecurity = require('../security');

module.exports = {
  ...originalSecurity,
  crypto,
  licenseValidator,
  fileIntegrity,
  ipcGuard,
  auditLogger,
};

