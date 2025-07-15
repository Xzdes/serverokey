// packages/serverokey/index.js
const http = require('http');
const path = require('path');

const { loadManifest } = require('./core/config-loader.js');
const { ConnectorManager } = require('./core/connector-manager.js');
const { AssetLoader } = require('./core/asset-loader.js');
const { Renderer } = require('./core/renderer.js');
const { RequestHandler } = require('./core/request-handler.js');
const { SocketEngine } = require('./core/socket-engine.js');

function createServer(appPath, options = {}) {
  if (!appPath) {
    throw new Error('[Serverokey] Application path must be provided.');
  }

  const { debug = false } = options;

  const manifest = loadManifest(appPath);
  
  const connectorManager = new ConnectorManager(appPath, manifest);
  const assetLoader = new AssetLoader(appPath, manifest);
  const renderer = new Renderer(assetLoader, manifest, connectorManager, appPath, { debug });
  const requestHandler = new RequestHandler(manifest, connectorManager, assetLoader, renderer, appPath, { debug });

  const server = http.createServer(requestHandler.handle.bind(requestHandler));
  
  const socketEngine = new SocketEngine(server, manifest, connectorManager);
  
  requestHandler.setSocketEngine(socketEngine);

  console.log('[Serverokey] Engine initialized.');

  // Возвращаем объект, содержащий все ключевые компоненты.
  // Это позволяет использовать их в тестах или при встраивании Serverokey в другие системы.
  return {
      server,
      requestHandler,
      socketEngine,
      connectorManager,
      assetLoader,
      renderer
  };
}

module.exports = { createServer };