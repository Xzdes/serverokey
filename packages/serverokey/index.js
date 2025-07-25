// packages/serverokey/index.js
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');
const getPort = require('get-port');

const { loadManifest } = require('./core/config-loader.js');
const { ConnectorManager } = require('./core/connector-manager.js');
const { AssetLoader } = require('./core/asset-loader.js');
const { Renderer } = require('./core/renderer.js');
const { RequestHandler } = require('./core/request-handler.js');
const { SocketEngine } = require('./core/socket-engine.js');

// --- ИЗМЕНЕНИЕ: Функция становится асинхронной ---
async function createServer(appPath, options = {}) {
  if (!appPath) {
    throw new Error('[Serverokey] Application path must be provided.');
  }

  const { debug = false } = options;
  const manifest = loadManifest(appPath);
  
  const connectorManager = new ConnectorManager(appPath, manifest);
  const assetLoader = new AssetLoader(appPath, manifest);
  const renderer = new Renderer(assetLoader, manifest, connectorManager, appPath, { debug });
  const requestHandler = new RequestHandler(manifest, connectorManager, assetLoader, renderer, appPath, { debug });

  // --- ИЗМЕНЕНИЕ: ЖДЕМ ПОЛНОЙ ИНИЦИАЛИЗАЦИИ RequestHandler ---
  await requestHandler.initPromise;
  console.log('[Serverokey] Request handler is fully initialized.');

  const server = http.createServer(requestHandler.handle.bind(requestHandler));
  const socketEngine = new SocketEngine(server, manifest, connectorManager);
  requestHandler.setSocketEngine(socketEngine);

  const launchConfig = manifest.launch || { mode: 'server' }; 

  if (launchConfig.mode === 'native') {
    // Передаем сервер, так как он уже создан
    await launchNativeMode(server, launchConfig.window);
  } else {
    const port = options.port || process.env.PORT || 3000;
    launchServerMode(server, port);
  }

  console.log('[Serverokey] Engine startup sequence complete.');

  // Возвращаем все компоненты, как и раньше, для тестов
  return {
      server,
      requestHandler,
      // ... и т.д.
  };
}

function launchServerMode(server, port) {
    // ... (без изменений) ...
    server.listen(port, () => {
        console.log(`🚀 Serverokey is running in SERVER mode on http://localhost:${port}`);
    });
}

async function launchNativeMode(server, windowConfig = {}) {
    // ... (без изменений) ...
    try {
        const port = await getPort();

        server.listen(port, '127.0.0.1', async () => {
          console.log(`[Serverokey] Running in NATIVE mode.`);
          console.log(`[Native Mode] Internal server started on http://127.0.0.1:${port}`);
    
          const defaultConfig = { title: "Serverokey App", width: 1024, height: 768, devtools: false };
          const config = { ...defaultConfig, ...windowConfig };
          
          try {
            const browser = await puppeteer.launch({
              headless: false,
              devtools: config.devtools,
              defaultViewport: null,
              args: [
                `--app=http://127.0.0.1:${port}`,
                `--window-size=${config.width},${config.height}`,
                '--disable-extensions',
                '--disable-infobars'
              ],
            });
            
            console.log(`[Native Mode] Chromium window launched.`);
            
            const pages = await browser.pages();
            const mainPage = pages[0];
            
            if (mainPage) {
                mainPage.on('close', () => {
                    console.log('[Native Mode] Window closed. Shutting down application.');
                    try {
                        process.kill(process.ppid, 'SIGKILL');
                    } catch (e) {}
                    process.exit(0);
                });
            }
            
            process.on('SIGINT', async () => {
                console.log('[Native Mode] SIGINT received. Closing browser...');
                await browser.close();
                process.exit(0);
            });
    
          } catch (e) {
            console.error('💥 [Native Mode] Failed to launch Chromium:', e);
            console.error('💥 Please ensure that your environment has all necessary dependencies for Puppeteer.');
            process.exit(1);
          }
        });
      } catch (error) {
        console.error('💥 [Native Mode] Failed to start:', error);
        process.exit(1);
      }
}

module.exports = { createServer };