// packages/serverokey/index.js
const http = require('http');
const path = require('path');

const { loadManifest } = require('./core/config-loader.js');
const { ConnectorManager } = require('./core/connector-manager.js');
const { AssetLoader } = require('./core/asset-loader.js');
const { Renderer } = require('./core/renderer.js');
const { RequestHandler } = require('./core/request-handler.js');

function createServer(appPath) {
  if (!appPath) {
    throw new Error('[Serverokey] Application path must be provided.');
  }

  const manifest = loadManifest(appPath);
  
  const connectorManager = new ConnectorManager(appPath, manifest);
  const assetLoader = new AssetLoader(appPath, manifest);
  const renderer = new Renderer(assetLoader, manifest, connectorManager);

  // Передаем путь к самому модулю, чтобы он мог найти engine-client.js
  const modulePath = __dirname; 
  const requestHandler = new RequestHandler(manifest, connectorManager, assetLoader, renderer, modulePath);

  const server = http.createServer(requestHandler.handle.bind(requestHandler));
  
  console.log('[Serverokey] Engine initialized.');
  return server;
}

module.exports = { createServer };