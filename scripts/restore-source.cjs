const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '../electron');

function findSourceBackups(directory) {
  const backups = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      backups.push(...findSourceBackups(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js.bak')) {
      backups.push(entryPath);
    }
  }
  return backups;
}

function restoreSource(sourceDirectory = electronDir) {
  for (const backupPath of findSourceBackups(sourceDirectory)) {
    const originalPath = backupPath.slice(0, -'.bak'.length);
    fs.copyFileSync(backupPath, originalPath);
    fs.unlinkSync(backupPath);
    console.log(`  ✓ Restored source: ${path.relative(sourceDirectory, originalPath)}`);
  }

  const remainingBackups = findSourceBackups(sourceDirectory);
  if (remainingBackups.length > 0) {
    throw new Error(`Source backups remain after restoration: ${remainingBackups.join(', ')}`);
  }

  console.log('✅ Source files restored.');
}

if (require.main === module) restoreSource();

module.exports = { restoreSource };
