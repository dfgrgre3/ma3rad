const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const jscPath = path.join(__dirname, 'main.jsc');

function loadMainEntry() {
  if (!app.isPackaged) {
    require('./main.js');
    return;
  }

  if (!fs.existsSync(jscPath)) {
    console.warn('[electron-entry] packaged bytecode is missing; falling back to source main.js');
    require('./main.js');
    return;
  }

  try {
    require('bytenode');
    require(jscPath);
  } catch (error) {
    console.warn('[electron-entry] main bytecode failed to load; falling back to source main.js', error);
    require('./main.js');
  }
}

loadMainEntry();
