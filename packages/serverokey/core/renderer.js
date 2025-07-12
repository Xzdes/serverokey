// core/renderer.js
const Mustache = require('./mustache.js');
const posthtml = require('posthtml');
const csstree = require('css-tree');

class Renderer {
    constructor(assetLoader, manifest, connectorManager) {
        this.assetLoader = assetLoader;
        this.manifest = manifest;
        this.connectorManager = connectorManager;
    }

    async _getGlobalContext() {
        const context = {};
        const globalsConfig = this.manifest.globals;
        if (!globalsConfig) return context;

        for (const key in globalsConfig) {
            if (key !== 'injectData') {
                context[key] = globalsConfig[key];
            }
        }

        if (Array.isArray(globalsConfig.injectData)) {
            const injectedData = await this.connectorManager.getContext(globalsConfig.injectData);
            Object.assign(context, injectedData);
        }

        context.asJSON = (data) => {
            if (data === undefined) return 'null';
            return JSON.stringify(data)
                .replace(/</g, '\\u003c')
                .replace(/>/g, '\\u003e');
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
                console.warn(`[Renderer] Could not evaluate atom-if condition: "${condition}"`, e.message);
                return false;
            }
        };

        return function(tree) {
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

    // ИСПРАВЛЕННАЯ, НАДЕЖНАЯ ВЕРСИЯ
    _scopeCss(css, scopeId) {
        if (!css) return '';
        try {
            const ast = csstree.parse(css, { onParseError: (e) => { throw e; } });
            const scopeAttr = `[data-component-id="${scopeId}"]`;
            const scopeNode = csstree.parse(scopeAttr, { context: 'selector' }).children.head.data;

            csstree.walk(ast, {
                enter: (node) => {
                    // ЯВНАЯ И СТРОГАЯ ПРОВЕРКА ТИПА УЗЛА
                    if (node.type !== 'Selector' || node.children.isEmpty()) {
                        return;
                    }
                    
                    const firstChild = node.children.head.data; 

                    if (firstChild.type === 'PseudoClassSelector' && firstChild.name.toLowerCase() === 'host') {
                        node.children.replace(node.children.head, csstree.clone(scopeNode));
                    } else {
                        node.children.prependData({ type: 'WhiteSpace', value: ' ' });
                        node.children.prepend(csstree.clone(scopeNode));
                    }
                }
            });
            return csstree.generate(ast);
        } catch (e) {
            // Убираем вывод в консоль, чтобы не засорять лог
            // console.warn(`[Renderer] Failed to scope CSS for ${scopeId}. Error: ${e.message}`);
            return css; 
        }
    }

    async renderComponent(componentName, dataContext = {}) {
        const component = this.assetLoader.getComponent(componentName);
        if (!component) throw new Error(`Component "${componentName}" not found.`);

        const componentId = `c-${Math.random().toString(36).slice(2, 9)}`;
        const globalContext = await this._getGlobalContext();
        const renderContext = { ...globalContext, ...dataContext, _internal: { id: componentId } };
        
        const scripts = [];
        
        const plugins = [
            this._createDirectivesPlugin(renderContext),
            this._createClientScriptsPlugin(scripts, componentId),
            this._createAddComponentIdPlugin(componentId)
        ];

        let mustacheHtml = Mustache.render(component.template, renderContext);
        
        const { html } = await posthtml(plugins).process(mustacheHtml, { sync: true });
        
        const styles = this._scopeCss(component.style, componentId);

        return { html, styles, scripts };
    }

    async renderView(routeConfig, globalData) {
        const layoutComponent = this.assetLoader.getComponent(routeConfig.layout);
        if (!layoutComponent) throw new Error(`Layout "${routeConfig.layout}" not found.`);

        const allStyles = new Set();
        const allScripts = [];
        const injectedHtml = {};

        const dataForInjectedComponents = await this.connectorManager.getContext(routeConfig.reads || []);
        const renderData = { ...globalData, ...dataForInjectedComponents };

        for (const placeholderName in routeConfig.inject) {
            const componentName = routeConfig.inject[placeholderName];
            if (componentName) {
                const { html, styles, scripts } = await this.renderComponent(componentName, renderData);
                if (styles) allStyles.add(styles);
                if (scripts) allScripts.push(...scripts);
                injectedHtml[placeholderName] = `<div id="${componentName}-container">${html}</div>`;
            }
        }

        const layoutContext = await this._getGlobalContext();
        let layoutHtml = layoutComponent.template.replace(/<atom-inject into="([^"]+)"><\/atom-inject>/g, (match, placeholderName) => {
            return injectedHtml[placeholderName] || `<!-- Placeholder for ${placeholderName} -->`;
        });
        layoutHtml = Mustache.render(layoutHtml, layoutContext);

        if (allStyles.size > 0) {
            const styleTag = `<style>\n${[...allStyles].join('\n')}\n</style>`;
            layoutHtml = layoutHtml.replace('</head>', `${styleTag}\n</head>`);
        }

        const scriptsTag = allScripts.length > 0
            ? `<script type="application/json" data-atom-scripts>${JSON.stringify(allScripts)}</script>`
            : '';
        const clientScriptTag = `<script src="/engine-client.js"></script>`;
        
        layoutHtml = layoutHtml.replace('</body>', `${scriptsTag}\n${clientScriptTag}\n</body>`);

        return layoutHtml;
    }
}

module.exports = { Renderer };