// engine.js - Точка входа. Собирает и запускает движок.
const http = require('http');
const path = require('path');

const { loadManifest } = require('./core/config-loader.js');
const { DataManager } = require('./core/data-manager.js');
const { AssetLoader } = require('./core/asset-loader.js');
const { Renderer } = require('./core/renderer.js');
const { RequestHandler } = require('./core/request-handler.js');


// --- Инициализация ---
const appPath = path.join(__dirname, 'kassa-app');

// 1. Загружаем конфигурацию
const manifest = loadManifest(appPath);

// 2. Инициализируем модули ядра
const dataManager = new DataManager(appPath, manifest); 
const assetLoader = new AssetLoader(appPath, manifest);
const renderer = new Renderer(assetLoader, manifest, dataManager); 
const requestHandler = new RequestHandler(manifest, dataManager, assetLoader, renderer);
// --- Запуск сервера ---
const port = 3000;
http.createServer(requestHandler.handle.bind(requestHandler))
    .listen(port, () => {
        console.log(`[Engine] Server running on http://localhost:${port}`);
        console.log(`[Engine] Application root: ${appPath}`);
    });