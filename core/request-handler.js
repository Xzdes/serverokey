// core/request-handler.js
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { DataManipulator } = require('./data-manipulator.js');
const { ActionEngine } = require('./action-engine.js'); // Обновленный импорт

class RequestHandler {
    constructor(manifest, dataManager, assetLoader, renderer) {
        this.manifest = manifest;
        this.dataManager = dataManager;
        this.assetLoader = assetLoader;
        this.renderer = renderer;
    }

    async handle(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const routeKey = `${req.method} ${url.pathname}`;

        if (routeKey === 'GET /engine-client.js') {
            const clientScriptPath = path.join(__dirname, '..', 'engine-client.js'); // Исправлен путь
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
                const html = this.renderer.renderView(routeConfig, this.dataManager.data);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
            }

            if (routeConfig.type === 'action') {
                const body = await this._parseBody(req);
                const context = this.dataManager.getContext(routeConfig.reads);
                context.body = body;

                let finalContext = context;

                if (routeConfig.steps) {
                    const engine = new ActionEngine(context);
                    await engine.run(routeConfig.steps);
                    finalContext = engine.context; // Получаем измененный контекст из движка
                } else if (routeConfig.manipulate) {
                    const manipulator = new DataManipulator(context, this.assetLoader);
                    manipulator.execute(routeConfig.manipulate);
                    finalContext = manipulator.context;
                } else if (routeConfig.handler) {
                    const handler = this.assetLoader.getAction(routeConfig.handler);
                    handler(context, body);
                    finalContext = context;
                } else {
                    throw new Error(`Action route ${routeKey} has no 'steps', 'manipulate', or 'handler' defined.`);
                }
                
                delete finalContext.body;

                routeConfig.writes.forEach(key => {
                    this.dataManager.updateAndSave(key, finalContext[key]);
                });

                const componentName = routeConfig.update;
                const { html, styles, scripts } = this.renderer.renderComponent(componentName, this.dataManager.data);
                
                const styleTag = styles ? `<style>${styles}</style>` : '';
                // Встраиваем скрипты в специальный тег, который клиентский JS сможет прочитать
                const scriptsTag = scripts.length > 0 
                    ? `<script type="application/json" data-atom-scripts>${JSON.stringify(scripts)}</script>`
                    : '';
                const finalHtml = `${styleTag}${html}${scriptsTag}`;

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(finalHtml);
            }
        } catch (error) {
            console.error(`[Engine] Error processing route ${routeKey}:`, error);
            res.writeHead(500).end('Internal Server Error');
        }
    }

    _parseBody(req) {
        return new Promise(resolve => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => resolve(JSON.parse(data || '{}')));
        });
    }
}

module.exports = { RequestHandler };