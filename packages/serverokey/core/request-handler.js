// packages/serverokey/core/request-handler.js
const { URL, URLSearchParams } = require('url');
const fs = require('fs');
const path = require('path');
const { ActionEngine } = require('./action-engine.js');
const { AuthEngine } = require('./auth-engine.js');
const cookie = require('cookie');

class RequestHandler {
    constructor(manifest, connectorManager, assetLoader, renderer, appPath, options = {}) {
        this.manifest = manifest;
        this.connectorManager = connectorManager;
        this.assetLoader = assetLoader;
        this.renderer = renderer;
        this.appPath = appPath;
        this.debug = options.debug || false;
        this.authEngine = null;
        this.userConnector = null;
        this.socketEngine = null;
        this.authInitPromise = this._initializeAuthEngine();
    }

    setSocketEngine(socketEngine) {
        this.socketEngine = socketEngine;
    }

    async _initializeAuthEngine() {
        if (this.manifest.auth) {
            try {
                this.userConnector = this.connectorManager.getConnector(this.manifest.auth.userConnector);
                const sessionConnector = this.connectorManager.getConnector('session');
                await Promise.all([this.userConnector.initPromise, sessionConnector.initPromise]);
                this.authEngine = new AuthEngine(this.manifest, this.userConnector.collection, sessionConnector.collection);
            } catch (e) {
                console.error("CRITICAL: Failed to initialize AuthEngine. Auth will be disabled.", e);
                this.authEngine = null;
            }
        }
    }

    async handle(req, res) {
        try {
            await this.authInitPromise;
            const url = new URL(req.url, `http://${req.headers.host}`);

            if (req.url === '/engine-client.js') {
                const clientScriptPath = path.resolve(__dirname, '..', 'engine-client.js');
                const scriptContent = fs.readFileSync(clientScriptPath);
                res.writeHead(200, { 'Content-Type': 'application/javascript' }).end(scriptContent);
                return;
            }

            const routeConfig = this.findRoute(req.method, url.pathname);
            if (!routeConfig) {
                return this.sendResponse(res, 404, 'Not Found');
            }

            if (routeConfig.internal === true) {
                return this.sendResponse(res, 403, 'Forbidden', 'text/plain');
            }

            let user = null;
            if (this.authEngine) {
                const session = await this.authEngine.getSession(req);
                if (session && session.userId) {
                    user = await this.userConnector.collection.getById(session.userId);
                }
            }

            if (routeConfig.auth?.required && !user) {
                const redirectUrl = routeConfig.auth.failureRedirect || '/login';
                if (req.headers['x-requested-with'] === 'ServerokeySPA') {
                    return this.sendResponse(res, 200, { redirectUrl }, 'application/json');
                }
                return this.authEngine.redirect(res, redirectUrl);
            }

            if (routeConfig.type === 'view') {
                const dataFromReads = await this.connectorManager.getContext(routeConfig.reads || []);
                const dataContext = { data: dataFromReads, user: user || null };

                if (req.headers['x-requested-with'] === 'ServerokeySPA') {
                    const spaPayload = { title: '', injectedParts: {}, styles: [], scripts: [] };
                    const mainContentPlaceholder = 'pageContent'; // Контейнер для основного контента

                    // Рендерим компонент, который должен быть вставлен в главный контейнер
                    const mainComponentToRender = routeConfig.inject[mainContentPlaceholder];
                    if (mainComponentToRender) {
                        const result = await this.renderer.renderComponentRecursive(mainComponentToRender, dataContext, routeConfig.inject, url);
                        spaPayload.injectedParts[mainContentPlaceholder] = result.html;
                        spaPayload.styles.push(...result.styles);
                        spaPayload.scripts.push(...result.scripts);

                        const mainComponentConfig = this.manifest.components[mainComponentToRender] || {};
                         spaPayload.title = (typeof mainComponentConfig === 'object' && mainComponentConfig.title) 
                            ? mainComponentConfig.title 
                            : (this.manifest.globals?.appName || 'Serverokey App');
                    }
                    
                    return this.sendResponse(res, 200, spaPayload, 'application/json');
                }
                
                const html = await this.renderer.renderView(routeConfig, dataContext, url);
                return this.sendResponse(res, 200, html, 'text/html; charset=utf-8');

            } else if (routeConfig.type === 'action') {
                const body = await this._parseBody(req);
                const socketId = req.headers['x-socket-id'] || null;
                const routeKey = `${req.method} ${url.pathname}`;
                await this.runAction(routeKey, { user, body, socketId }, req, res, this.debug);
            }
        } catch (error) {
            console.error(`[Engine] Error processing request ${req.method} ${req.url}:`, error);
            if (!res.writableEnded) {
                this.sendResponse(res, 500, 'Internal Server Error');
            }
        }
    }

    findRoute(method, pathname) {
        const routes = this.manifest.routes || {};
        const fullKey = `${method} ${pathname}`;
        if (routes[fullKey]) return routes[fullKey];

        const pathAsKey = pathname.startsWith('/') ? pathname.substring(1) : pathname;
        if (routes[pathAsKey]) return routes[pathAsKey];

        return null;
    }

    async runAction(routeName, initialContext, req, res, debug = false) {
        const routeConfig = this.manifest.routes[routeName];
        if (!routeConfig) throw new Error(`Action route '${routeName}' not found.`);

        const context = {
            data: initialContext.data || await this.connectorManager.getContext(routeConfig.reads || []),
            user: initialContext.user,
            body: initialContext.body,
        };

        const engine = new ActionEngine(context, this.appPath, this.assetLoader, this, debug);
        await engine.run(routeConfig.steps || []);
        const finalContext = engine.context;
        const internalActions = finalContext._internal || {};

        if (internalActions.loginUser && this.authEngine) {
            const sessionId = await this.authEngine.createSession(internalActions.loginUser);
            if (res) res.setHeader('Set-Cookie', cookie.serialize('session_id', sessionId, { httpOnly: true, maxAge: 60 * 60 * 24 * 7, path: '/', sameSite: 'lax' }));
        }

        if (internalActions.logout && this.authEngine) {
            if (res) await this.authEngine.clearSession(req, res);
        }

        for (const key of (routeConfig.writes || [])) {
            if (finalContext.data[key]) {
                await this.connectorManager.getConnector(key).write(finalContext.data[key]);
                if (this.socketEngine) await this.socketEngine.notifyOnWrite(key, initialContext.socketId);
            }
        }

        if (res) {
            const responsePayload = {};
            if (internalActions.redirectUrl) {
                responsePayload.redirectUrl = internalActions.redirectUrl;
            } else if (routeConfig.update) {
                const currentUrl = req ? new URL(req.url, `http://${req.headers.host}`) : null;
                const componentRenderContext = { data: finalContext.data, user: finalContext.user, globals: this.manifest.globals };
                const componentUpdate = await this.renderer.renderComponent(routeConfig.update, componentRenderContext, currentUrl);
                Object.assign(responsePayload, componentUpdate);
            }
            this.sendResponse(res, 200, responsePayload, 'application/json');
        }

        return finalContext;
    }

    _parseBody(req) {
        return new Promise((resolve, reject) => {
            const contentType = req.headers['content-type'] || '';
            const MAX_BODY_SIZE = 1e6;
            let body = '';
            let size = 0;
            req.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_BODY_SIZE) {
                    req.socket.destroy();
                    return reject(new Error('Payload Too Large'));
                }
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    if (!body) return resolve({});
                    if (contentType.includes('application/json')) resolve(JSON.parse(body));
                    else if (contentType.includes('application/x-www-form-urlencoded')) resolve(Object.fromEntries(new URLSearchParams(body).entries()));
                    else resolve({});
                } catch (e) {
                    reject(new Error(`Invalid request body: ${e.message}`));
                }
            });
            req.on('error', err => reject(err));
        });
    }

    sendResponse(res, statusCode, data, contentType = 'text/plain') {
        if (res.writableEnded) return;
        const body = (contentType.includes('json') && typeof data !== 'string') ? JSON.stringify(data) : data;
        res.writeHead(statusCode, { 'Content-Type': contentType }).end(body);
    }
}

module.exports = { RequestHandler };