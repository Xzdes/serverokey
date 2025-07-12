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
            const clientScriptPath = path.join(this.modulePath, 'engine-client.js'); 
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
                // Добавляем данные, которые были прочитаны в экшене, чтобы они были доступны для рендера
                routeConfig.reads.forEach(key => {
                    if (!allDataKeysToRender.includes(key)) {
                        allDataKeysToRender.push(key);
                    }
                });

                const updatedContext = await this.connectorManager.getContext(allDataKeysToRender);
                
                const componentName = routeConfig.update;
                const { html, styles, scripts } = await this.renderer.renderComponent(componentName, updatedContext);
                
                const styleTag = styles ? `<style>${styles}</style>` : '';
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