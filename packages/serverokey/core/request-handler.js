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
        if (!this.appPath) {
            throw new Error('[RequestHandler] appPath must be provided.');
        }
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
        await this.authInitPromise;

        const url = new URL(req.url, `http://${req.headers.host}`);
        const routeKey = `${req.method} ${url.pathname}`;
        
        if (routeKey === 'GET /engine-client.js') {
            const clientScriptPath = path.resolve(__dirname, '..', 'engine-client.js');
            try {
                const scriptContent = fs.readFileSync(clientScriptPath);
                res.writeHead(200, { 'Content-Type': 'application/javascript' }).end(scriptContent);
            } catch (error) {
                console.error(`[Engine] CRITICAL: Could not read engine-client.js file.`, error);
                res.writeHead(500).end('Internal Server Error');
            }
            return;
        }

        let user = null;
        if (this.authEngine) {
            const session = await this.authEngine.getSession(req);
            if (session && session.userId) {
                user = await this.userConnector.collection.getById(session.userId);
            }
        }
        
        let routeConfig = this.findRoute(routeKey);

        if (!routeConfig) {
            const internalRoute = this.findRoute(url.pathname.substring(1));
            if (internalRoute && internalRoute.internal === true) {
                console.warn(`[RequestHandler] Attempted to access internal route '${url.pathname}' via HTTP. Denied.`);
                res.writeHead(403).end('Forbidden');
                return;
            }
            res.writeHead(404).end('Not Found');
            return;
        }

        if (routeConfig.auth?.required && !user) {
            if (this.authEngine) {
                this.authEngine.redirect(res, routeConfig.auth.failureRedirect || '/login');
            } else {
                 res.writeHead(403).end('Forbidden: Auth engine not configured.');
            }
            return;
        }
        
        try {
            if (routeConfig.type === 'view') {
                const dataFromReads = await this.connectorManager.getContext(routeConfig.reads || []);
                const dataContext = { data: dataFromReads, user: user || null };
                
                const isSpaRequest = req.headers['x-requested-with'] === 'ServerokeySPA';

                if (isSpaRequest) {
                    const spaPayload = { title: '', styles: [], scripts: [], injectedParts: {} };
                    
                    if (routeConfig.inject) {
                        for (const placeholder in routeConfig.inject) {
                            const componentName = routeConfig.inject[placeholder];
                            if (componentName) {
                                const { html, styles, scripts } = await this.renderer.renderComponent(componentName, dataContext, url);
                                // Отдаем чистый HTML, без оберток
                                spaPayload.injectedParts[placeholder] = html; 
                                if (styles) spaPayload.styles.push({ name: componentName, css: styles });
                                if (scripts) spaPayload.scripts.push(...scripts);
                            }
                        }
                    }
                    
                    const componentNameForTitle = routeConfig.inject?.pageContent || routeConfig.layout;
                    const componentConfig = this.manifest.components[componentNameForTitle];
                    spaPayload.title = (typeof componentConfig === 'object' && componentConfig.title) 
                        ? componentConfig.title 
                        : (this.manifest.globals?.appName || 'Serverokey App');

                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(spaPayload));

                } else {
                    const html = await this.renderer.renderView(routeConfig, dataContext, url);
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
                }

            } else if (routeConfig.type === 'action') {
                const body = await this._parseBody(req);
                const socketId = req.headers['x-socket-id'] || null;
                await this.runAction(routeKey, { user, body, socketId }, req, res, this.debug);
            }
        } catch (error) {
            console.error(`[Engine] Error processing route ${routeKey}:`, error);
            res.writeHead(500).end('Internal Server Error');
        }
    }
    
    findRoute(key) {
        if (this.manifest.routes[key]) {
            return this.manifest.routes[key];
        }
        return null;
    }

    async runAction(routeName, initialContext, req, res, debug = false) {
        const routeConfig = this.findRoute(routeName);
        if (!routeConfig) {
            throw new Error(`[RequestHandler] Action route '${routeName}' not found.`);
        }
        
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
            if(res) res.setHeader('Set-Cookie', cookie.serialize('session_id', sessionId, {
                httpOnly: true, maxAge: 60 * 60 * 24 * 7, path: '/', sameSite: 'lax'
            }));
        }
        
        if (internalActions.logout && this.authEngine) {
            if(res) await this.authEngine.clearSession(req, res);
        }

        for (const key of (routeConfig.writes || [])) {
            if (finalContext.data[key]) {
                await this.connectorManager.getConnector(key).write(finalContext.data[key]);
                if (this.socketEngine) {
                    await this.socketEngine.notifyOnWrite(key, initialContext.socketId);
                }
            }
        }

        if (res) {
            const responsePayload = {};
            if (internalActions.redirectUrl) {
                responsePayload.redirectUrl = internalActions.redirectUrl;
            } else if (routeConfig.update) {
                 const currentUrl = req ? new URL(req.url, `http://${req.headers.host}`) : null;
                 const componentRenderContext = { data: finalContext.data, user: finalContext.user };
                 const componentUpdate = await this.renderer.renderComponent(routeConfig.update, componentRenderContext, currentUrl);
                 Object.assign(responsePayload, componentUpdate);
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(responsePayload));
        }

        return finalContext;
    }

    _parseBody(req) {
        const contentType = req.headers['content-type'] || '';
        const MAX_BODY_SIZE = 1e6;

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
                    if (contentType.includes('application/json')) {
                        resolve(body ? JSON.parse(body) : {});
                    } else if (contentType.includes('application/x-www-form-urlencoded')) {
                        const params = new URLSearchParams(body);
                        resolve(Object.fromEntries(params.entries()));
                    } else { resolve({}); }
                } catch (e) {
                    reject(new Error('Invalid request body'));
                }
            });
            req.on('error', err => reject(err));
        });
    }
}

module.exports = { RequestHandler };