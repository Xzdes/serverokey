// core/renderer.js
const Mustache = require('./mustache.js');
const posthtml = require('posthtml');
const csstree = require('css-tree');

class Renderer {
    constructor(assetLoader, manifest, connectorManager, modulePath, options = {}) {
        this.assetLoader = assetLoader;
        this.manifest = manifest;
        this.connectorManager = connectorManager;
        this.debug = options.debug || false;
    }

    async _getGlobalContext(reqUrl = null) {
        const context = {};
        const globalsConfig = this.manifest.globals;
        if (globalsConfig) {
            for (const key in globalsConfig) {
                if (key !== 'injectData') {
                    context[key] = globalsConfig[key];
                }
            }
            if (Array.isArray(globalsConfig.injectData)) {
                const injectedData = await this.connectorManager.getContext(globalsConfig.injectData);
                Object.assign(context, injectedData);
            }
        }

        if (reqUrl) {
            const { URLSearchParams } = require('url');
            const searchParams = new URLSearchParams(reqUrl.search);
            context.url = {
                pathname: reqUrl.pathname,
                query: Object.fromEntries(searchParams.entries())
            };
        }

        context.asJSON = (data) => {
            if (data === undefined) return 'null';
            return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
        };
        return context;
    }

    _createDirectivesPlugin(dataContext) {
        const evaluateCondition = (condition) => {
            try {
                const contextKeys = Object.keys(dataContext);
                const contextValues = Object.values(dataContext);
                const func = new Function(...contextKeys, `return ${condition};`);
                return !!func(...contextValues);
            } catch (e) {
                // В режиме отладки выводим ошибку, чтобы было проще найти проблему
                if(this.debug) console.warn(`[Renderer] Could not evaluate atom-if condition: "${condition}". Error: ${e.message}`);
                return false;
            }
        };

        return (tree) => {
            tree.walk(node => {
                if (node && node.attrs && node.attrs['atom-if']) {
                    if (evaluateCondition(node.attrs['atom-if'])) {
                        delete node.attrs['atom-if'];
                    } else {
                        return null;
                    }
                }
                return node;
            });
        };
    }

    _createClientScriptsPlugin(scripts, componentId) {
        return function(tree) {
            tree.walk(node => {
                if (node && node.tag === 'script' && node.attrs && node.attrs.hasOwnProperty('atom-run')) {
                    const scriptContent = node.content ? node.content.join('').trim() : '';
                    if (scriptContent) {
                        scripts.push({
                            id: componentId,
                            code: scriptContent
                        });
                    }
                    return null;
                }
                return node;
            });
        };
    }

    _createAddComponentIdPlugin(componentId) {
        return function(tree) {
            let alreadyAdded = false;
            tree.walk(node => {
                if (!alreadyAdded && node && typeof node.tag === 'string') {
                    node.attrs = node.attrs || {};
                    node.attrs['data-component-id'] = componentId;
                    alreadyAdded = true;
                }
                return node;
            });
        };
    }

    _scopeCss(css, scopeId) {
        if (!css || !scopeId) return '';
        
        try {
            const ast = csstree.parse(css, {
                onParseError: (error) => {
                    console.warn(`[Renderer] CSS parse error for scope ${scopeId}: ${error.message}`);
                }
            });

            const scopeAttr = `[data-component-id="${scopeId}"]`;
            const scopeAst = csstree.parse(scopeAttr, { context: 'selector' });
            const attributeSelectorNode = csstree.find(scopeAst, node => node.type === 'AttributeSelector');

            if (!attributeSelectorNode) {
                console.warn(`[Renderer] Could not create a scope attribute node for ${scopeId}.`);
                return css;
            }

            csstree.walk(ast, {
                visit: 'Selector',
                enter: (selector) => {
                    if (!selector.children || selector.children.isEmpty) {
                        return;
                    }
                    const firstChild = selector.children.head ? selector.children.head.data : null;
                    if (!firstChild) {
                        return;
                    }
                    if (firstChild.type === 'PseudoClassSelector' && firstChild.name.toLowerCase() === 'host') {
                        selector.children.replace(selector.children.head, {
                            type: 'ListItem',
                            data: csstree.clone(attributeSelectorNode)
                        });
                        return;
                    }
                    const selectorName = firstChild.name ? String(firstChild.name).toLowerCase() : '';
                    if (
                        firstChild.type === 'Percentage' ||
                        (firstChild.type === 'TypeSelector' && ['from', 'to', 'html', 'body'].includes(selectorName)) ||
                        (firstChild.type === 'PseudoClassSelector' && ['root'].includes(selectorName))
                    ) {
                        return;
                    }
                    
                    selector.children.prependData({ type: 'WhiteSpace', value: ' ' });
                    selector.children.prependData(csstree.clone(attributeSelectorNode));
                }
            });

            return csstree.generate(ast);
        } catch (e) {
            console.error(`[Renderer] A critical error occurred while scoping CSS for ${scopeId}. Error:`, e);
            return css;
        }
    }

    async renderComponent(componentName, dataContext = {}, reqUrl = null) {
        const component = this.assetLoader.getComponent(componentName);
        if (!component) throw new Error(`Component "${componentName}" not found.`);

        // --- КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ ЗДЕСЬ ---
        // Получаем глобальный контекст и смешиваем его с переданным
        const globalContext = await this._getGlobalContext(reqUrl);
        const renderContext = { ...globalContext, ...dataContext };

        const componentId = `c-${Math.random().toString(36).slice(2, 9)}`;
        renderContext._internal = { id: componentId };
        
        const scripts = [];
        
        const plugins = [
            this._createDirectivesPlugin(renderContext),
            this._createClientScriptsPlugin(scripts, componentId),
            this._createAddComponentIdPlugin(componentId)
        ];

        let mustacheHtml = Mustache.render(component.template, renderContext);
        
        const { html } = await posthtml(plugins).process(mustacheHtml, { sync: true });
        
        const styles = this._scopeCss(component.style, componentId);

        let finalHtml = html;
        if (this.debug) {
            const safeContextJson = JSON.stringify(renderContext, (key, value) => {
                if (key === '_col' || value instanceof Promise) return `[Complex Object]`;
                return value;
            }, 2);
            finalHtml = `<!-- [DEBUG] Rendered component '${componentName}' with context:\n${safeContextJson}\n-->\n${html}`;
        }

        return { html: finalHtml, styles, scripts, componentName };
    }

    async renderView(routeConfig, dataContext, reqUrl) {
        const layoutComponent = this.assetLoader.getComponent(routeConfig.layout);
        if (!layoutComponent) throw new Error(`Layout "${routeConfig.layout}" not found.`);

        const globalContext = await this._getGlobalContext(reqUrl);
        const finalRenderContext = { ...globalContext, ...dataContext };

        const allStyleTags = [];
        const allScripts = [];
        const injectedHtml = {};

        for (const placeholderName in routeConfig.inject) {
            const componentName = routeConfig.inject[placeholderName];
            if (componentName) {
                // Передаем ЕДИНЫЙ контекст, а reqUrl больше не нужен, т.к. он уже в globalContext
                const { html, styles, scripts } = await this.renderComponent(componentName, finalRenderContext, reqUrl);
                if (styles) {
                    allStyleTags.push(`<style data-component-name="${componentName}">${styles}</style>`);
                }
                if (scripts) allScripts.push(...scripts);
                injectedHtml[placeholderName] = `<div id="${componentName}-container">${html}</div>`;
            }
        }

        let layoutHtml = layoutComponent.template.replace(/<atom-inject into="([^"]+)"><\/atom-inject>/g, (match, placeholderName) => {
            return injectedHtml[placeholderName] || `<!-- Placeholder for ${placeholderName} -->`;
        });
        
        layoutHtml = Mustache.render(layoutHtml, finalRenderContext);

        if (allStyleTags.length > 0) {
            const styleTag = allStyleTags.join('\n');
            layoutHtml = layoutHtml.replace('</head>', `${styleTag}\n</head>`);
        }

        const scriptsTag = allScripts.length > 0
            ? `<script type="application/json" data-atom-scripts>${JSON.stringify(allScripts)}</script>`
            : '';
        const clientScriptTag = `<script src="/engine-client.js"></script>`;
        
        let finalBodyTag = `${scriptsTag}\n${clientScriptTag}\n</body>`;
        if (this.debug) {
            layoutHtml = layoutHtml.replace('<body', '<body data-debug-mode="true"');
        }
        
        layoutHtml = layoutHtml.replace('</body>', finalBodyTag);
        
        return layoutHtml;
    }
}

module.exports = { Renderer };