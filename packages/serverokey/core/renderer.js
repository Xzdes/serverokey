// packages/serverokey/core/renderer.js
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
            Object.assign(context, globalsConfig);
        }
        if (reqUrl) {
            const { URLSearchParams } = require('url');
            context.url = {
                pathname: reqUrl.pathname,
                query: Object.fromEntries(new URLSearchParams(reqUrl.search))
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
                const func = new Function(...Object.keys(dataContext), `return ${condition};`);
                return !!func(...Object.values(dataContext));
            } catch (e) {
                if(this.debug) console.warn(`[Renderer] atom-if failed: "${condition}". Error: ${e.message}`);
                return false;
            }
        };
        return (tree) => tree.match({ attrs: { 'atom-if': true } }, (node) => {
            if (!evaluateCondition(node.attrs['atom-if'])) return '';
            delete node.attrs['atom-if'];
            return node;
        });
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
            return tree;
        };
    }
    
    _scopeCss(css, scopeId) {
        if (!css || !scopeId) return '';
        try {
            const ast = csstree.parse(css);
            
            csstree.walk(ast, {
                visit: 'Rule',
                enter: function(rule) {
                    if (rule.type !== 'Rule' || !rule.prelude || rule.prelude.type !== 'SelectorList') {
                        return;
                    }
                    
                    const originalSelectors = csstree.generate(rule.prelude);

                    const scopedSelectors = originalSelectors.split(',')
                        .map(selectorString => {
                            const trimmedSelector = selectorString.trim();
                            if (trimmedSelector.startsWith(':host')) {
                                return trimmedSelector.replace(/:host/g, `[data-component-id="${scopeId}"]`);
                            }
                            return `[data-component-id="${scopeId}"] ${trimmedSelector}`;
                        })
                        .join(', ');

                    rule.prelude = csstree.parse(scopedSelectors, { context: 'selectorList' });
                }
            });
            
            return csstree.generate(ast);
        } catch (e) {
            console.error(`[Renderer] Error scoping CSS for ${scopeId}:`, e);
            return css; 
        }
    }

    async renderComponentRecursive(componentName, dataContext, routeInjectConfig, reqUrl) {
        const component = this.assetLoader.getComponent(componentName);
        if (!component) throw new Error(`Component "${componentName}" not found.`);

        let componentTemplate = component.template;
        const collectedStyles = [];
        const collectedScripts = [];
        const componentId = `c-${Math.random().toString(36).slice(2, 9)}`;

        const scopedCss = this._scopeCss(component.style || '', componentId);
        if (scopedCss) {
            collectedStyles.push({ name: componentName, id: componentId, css: scopedCss });
        }

        const placeholders = componentTemplate.match(/<atom-inject into="([^"]+)"><\/atom-inject>/g) || [];
        for (const placeholder of placeholders) {
            const placeholderName = placeholder.match(/into="([^"]+)"/)[1];
            const childComponentName = routeInjectConfig[placeholderName];
            if (childComponentName) {
                const childResult = await this.renderComponentRecursive(childComponentName, dataContext, routeInjectConfig, reqUrl);
                componentTemplate = componentTemplate.replace(placeholder, childResult.html);
                collectedStyles.push(...childResult.styles);
                collectedScripts.push(...childResult.scripts);
            }
        }
        
        const mustacheHtml = Mustache.render(componentTemplate, dataContext);
        
        const posthtmlPlugins = [
            this._createDirectivesPlugin(dataContext),
            this._createAddComponentIdPlugin(componentId)
        ];
        const { html } = await posthtml(posthtmlPlugins).process(mustacheHtml, { sync: true });
        
        return { html, styles: collectedStyles, scripts: collectedScripts };
    }

    async renderComponent(componentName, dataContext = {}, reqUrl = null) {
        const { html, styles, scripts } = await this.renderComponentRecursive(componentName, dataContext, {}, reqUrl);
        return {
            html,
            styles: styles.map(s => s.css).join('\n'),
            scripts,
            componentName
        };
    }
    
    async renderView(routeConfig, dataContext, reqUrl) {
        const layoutComponent = this.assetLoader.getComponent(routeConfig.layout);
        if (!layoutComponent) throw new Error(`Layout "${routeConfig.layout}" not found.`);

        const globalContext = await this._getGlobalContext(reqUrl);
        const finalRenderContext = { ...globalContext, ...dataContext };
        
        // --- ИЗМЕНЕНИЕ ЛОГИКИ ЗАГОЛОВКА ---
        // Приоритет: launch.window.title -> globals.appName -> 'Serverokey'
        const appTitle = this.manifest.launch?.window?.title || finalRenderContext.globals?.appName || 'Serverokey';
        finalRenderContext.globals = { ...(finalRenderContext.globals || {}), appName: appTitle };
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

        const { html, styles, scripts } = await this.renderComponentRecursive(
            routeConfig.layout, 
            finalRenderContext, 
            routeConfig.inject, 
            reqUrl
        );
        
        let finalHtml = html;

        if (styles.length > 0) {
            const styleTags = styles.map(s => `<style data-component-name="${s.name}" id="style-for-${s.id}">${s.css}</style>`).join('\n');
            finalHtml = finalHtml.includes('</head>') 
                ? finalHtml.replace('</head>', `${styleTags}\n</head>`)
                : finalHtml + styleTags;
        }
        
        const clientScriptTag = `<script src="/engine-client.js"></script>`;
        const scriptsTag = scripts.length > 0 ? `<script type="application/json" data-atom-scripts>${JSON.stringify(scripts)}</script>` : '';
        const finalBodyTag = `${scriptsTag}\n${clientScriptTag}\n</body>`;

        finalHtml = finalHtml.includes('</body>')
            ? finalHtml.replace('</body>', finalBodyTag)
            : finalHtml + finalBodyTag;

        if (this.debug) {
            finalHtml = finalHtml.replace('<body', '<body data-debug-mode="true"');
        }
        
        return finalHtml;
    }
}

module.exports = { Renderer };