const bytenode = require('bytenode');
const path = require('path');
const fs = require('fs');

const jscPath = path.join(__dirname, 'main.jsc');

if (fs.existsSync(jscPath)) {
  // تشغيل بايت كود V8 الثنائي المحمي
  require(jscPath);
} else {
  // تشغيل ملف JS العادي في بيئة التطوير
  require('./main.js');
}

