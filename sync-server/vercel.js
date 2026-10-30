'use strict';

const { createSyncServer, makePoolFromEnvironment, sendJson } = require('./server');
const { normalizeClients } = require('./validation');

let service;

function getService() {
  if (service) return service;
  let clients;
  try {
    clients = normalizeClients(JSON.parse(process.env.CERAMISYS_SYNC_CLIENTS || ''));
  } catch (error) {
    throw new Error(`CERAMISYS_SYNC_CLIENTS is missing or invalid: ${error.message}`);
  }
  if (clients.length === 0) {
    throw new Error('CERAMISYS_SYNC_CLIENTS must contain at least one sync client.');
  }
  service = createSyncServer({ pool: makePoolFromEnvironment(), clients });
  return service;
}

module.exports = async function handler(request, response) {
  try {
    getService().handler(request, response);
  } catch (error) {
    console.error('Could not initialize the PostgreSQL synchronization service:', error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: 'Synchronization service error' });
    } else {
      response.destroy(error);
    }
  }
};
