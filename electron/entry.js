const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const jscPath = path.join(__dirname, 'main.jsc');

if (app.isPackaged) {
  if (!fs.existsSync(jscPath)) {
    throw new Error('Packaged Electron main-process bytecode is missing.');
  }
  require('bytenode');
  require(jscPath);
} else {
  require('./main.js');
}
