// core/request-handler.js
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { OperationHandler } = require('./operation-handler.js');
const { ActionEngine } = require('./action-engine.js');

class RequestHandler {
    constructor(manifest, connectorManager, assetLoader, renderer, modulePath) {
        this.manifest = manifest;
        this.connectorManager = connectorManager;
        this.assetLoader = assetLoader;
        this.renderer = renderer;
        this.modulePath = modulePath;
    }

    async handle(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const routeKey = `${req.method} ${url.pathname}`;

        if (routeKey === 'GET /engine-client.js') {
            // ИСПРАВЛЕНИЕ: Указываем точный путь к файлу, чтобы избежать путаницы.
            // Файл находится в корне пакета, а не в директории 'core'.
            const clientScriptPath = path.resolve(__dirname, '..', 'engine-client.js'); 
            res.writeHead(200, { 'Content-Type': 'application/javascript' }).end(fs.readFileSync(clientScriptPath));
            return;
        }

        const routeConfig = this.manifest.routes[routeKey];
        if (!routeConfig) {
            res.writeHead(404).end('Not Found');
            return;
        }
        
        try {
            if (routeConfig.type === 'view') {
                const globalDataKeys = this.manifest.globals?.injectData || [];
                const globalDataContext = await this.connectorManager.getContext(globalDataKeys);
                const html = await this.renderer.renderView(routeConfig, globalDataContext);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
            }

            if (routeConfig.type === 'action') {
                const body = await this._parseBody(req);
                const context = await this.connectorManager.getContext(routeConfig.reads);
                context.body = body;

                let finalContext = context;

                if (routeConfig.steps) {
                    const engine = new ActionEngine(context);
                    await engine.run(routeConfig.steps);
                    finalContext = engine.context;
                } else if (routeConfig.manipulate) {
                    const handler = new OperationHandler(context, this.assetLoader);
                    handler.execute(routeConfig.manipulate);
                    finalContext = handler.context;
                } else if (routeConfig.handler) {
                    const handler = this.assetLoader.getAction(routeConfig.handler);
                    handler(context, body);
                    finalContext = context;
                } else {
                    throw new Error(`Action route ${routeKey} has no 'steps', 'manipulate', or 'handler' defined.`);
                }
                
                delete finalContext.body;

                for (const key of routeConfig.writes) {
                    const connector = this.connectorManager.getConnector(key);
                    await connector.write(finalContext[key]);
                }

                const allDataKeysToRender = this.manifest.globals?.injectData || [];
                routeConfig.reads.forEach(key => {
                    if (!allDataKeysToRender.includes(key)) {
                        allDataKeysToRender.push(key);
                    }
                });

                const updatedContext = await this.connectorManager.getContext(allDataKeysToRender);
                // ИСПРАВЛЕНИЕ: Получаем глобальный контекст, чтобы он был доступен в перерисованном компоненте.
                const globalContext = await this.renderer._getGlobalContext();
                // ИСПРАВЛЕНИЕ: Добавляем данные из тела запроса (состояние инпута) в контекст для рендеринга.
                // Это гарантирует, что значение в инпуте сохранится после перерисовки.
                const renderDataContext = { ...updatedContext, ...body };
                
                const componentName = routeConfig.update;
                const { html, styles, scripts } = await this.renderer.renderComponent(componentName, renderDataContext, globalContext);
                
                const responsePayload = {
                    html,
                    styles,
                    scripts,
                    componentName
                };
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(responsePayload));
            }
        } catch (error) {
            console.error(`[Engine] Error processing route ${routeKey}:`, error);
            res.writeHead(500).end('Internal Server Error');
        }
    }

    _parseBody(req) {
        const MAX_BODY_SIZE = 1e6; // 1MB

        return new Promise((resolve, reject) => {
            let body = '';
            let size = 0;

            req.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_BODY_SIZE) {
                    req.socket.destroy(); 
                    reject(new Error('Payload Too Large'));
                    return; 
                }
                body += chunk.toString();
            });

            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (e) {
                    reject(new Error('Invalid JSON in request body'));
                }
            });

            req.on('error', err => {
                reject(err);
            });
        });
    }
}

module.exports = { RequestHandler };