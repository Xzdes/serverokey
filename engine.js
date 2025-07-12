// engine.js
const http = require('http');
const path = require('path');

const { loadManifest } = require('./core/config-loader.js');
const { ConnectorManager } = require('./core/connector-manager.js');
const { AssetLoader } = require('./core/asset-loader.js');
const { Renderer } = require('./core/renderer.js');
const { RequestHandler } = require('./core/request-handler.js');


const appPath = path.join(__dirname, 'kassa-app');

const manifest = loadManifest(appPath);

const connectorManager = new ConnectorManager(appPath, manifest);
const assetLoader = new AssetLoader(appPath, manifest);
const renderer = new Renderer(assetLoader, manifest, connectorManager);
const requestHandler = new RequestHandler(manifest, connectorManager, assetLoader, renderer);

const port = 3000;
http.createServer(requestHandler.handle.bind(requestHandler))
    .listen(port, () => {
        console.log(`[Engine] Server running on http://localhost:${port}`);
        console.log(`[Engine] Application root: ${appPath}`);
    });