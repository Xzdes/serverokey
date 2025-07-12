// packages/serverokey/index.js
const http = require('http');
const path = require('path');

const { loadManifest } = require('./core/config-loader.js');
const { ConnectorManager } = require('./core/connector-manager.js');
const { AssetLoader } = require('./core/asset-loader.js');
const { Renderer } = require('./core/renderer.js');
const { RequestHandler } = require('./core/request-handler.js');

function createServer(appPath, options = {}) { // --- ИЗМЕНЕНИЕ: Принимаем options ---
  if (!appPath) {
    throw new Error('[Serverokey] Application path must be provided.');
  }

  // --- НОВЫЙ БЛОК: Извлекаем опцию debug ---
  const { debug = false } = options;

  const manifest = loadManifest(appPath);
  
  const modulePath = __dirname; 
  
  const connectorManager = new ConnectorManager(appPath, manifest);
  const assetLoader = new AssetLoader(appPath, manifest);
  // --- ИЗМЕНЕНИЕ: Передаем debug в конструкторы ---
  const renderer = new Renderer(assetLoader, manifest, connectorManager, modulePath, { debug });
  const requestHandler = new RequestHandler(manifest, connectorManager, assetLoader, renderer, modulePath, { debug });

  const server = http.createServer(requestHandler.handle.bind(requestHandler));
  
  console.log('[Serverokey] Engine initialized.');
  return server;
}

module.exports = { createServer };