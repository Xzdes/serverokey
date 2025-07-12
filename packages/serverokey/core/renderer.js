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

    // ЕДИНЫЙ, НАДЕЖНЫЙ ПЛАГИН ДЛЯ ВСЕХ HTML-ПРЕОБРАЗОВАНИЙ
    _createHtmlProcessorPlugin(dataContext, scripts, componentId) {
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
            let rootNode = null;

            tree.walk(node => {
                if (typeof node !== 'object' || node === null) {
                    return node;
                }

                // Находим первый корневой узел-тег
                if (!rootNode && typeof node.tag === 'string') {
                    rootNode = node;
                }

                // Обработка atom-if
                if (node.attrs && node.attrs['atom-if']) {
                    if (evaluateCondition(node.attrs['atom-if'])) {
                        delete node.attrs['atom-if'];
                    } else {
                        return null; // Правильный способ удалить узел
                    }
                }

                // Обработка atom-run
                if (node.tag === 'script' && node.attrs && node.attrs.hasOwnProperty('atom-run')) {
                    const scriptContent = node.content ? node.content.join('').trim() : '';
                    if (scriptContent) {
                        scripts.push({
                            id: componentId,
                            code: scriptContent
                        });
                    }
                    return null; // Удаляем узел скрипта
                }

                return node;
            });

            // После всех модификаций добавляем ID к найденному корневому узлу
            if (rootNode) {
                rootNode.attrs = rootNode.attrs || {};
                rootNode.attrs['data-component-id'] = componentId;
            }

            return tree;
        };
    }
    
    _scopeCss(css, scopeId) {
        if (!css) return '';
        try {
            const ast = csstree.parse(css, { onParseError: (e) => { throw e; } });
            const scopeAttr = `[data-component-id="${scopeId}"]`;
            // ИСПРАВЛЕНО: Правильно получаем AST для селектора атрибута
            const scopeAttributeNode = csstree.parse(scopeAttr, { context: 'selector' }).children.head.data;

            csstree.walk(ast, {
                visit: 'Selector',
                enter: (node) => {
                    node.children.forEach(selectorPart => {
                        const firstChild = selectorPart.children.first();
                        
                        if (firstChild && firstChild.type === 'PseudoClassSelector' && firstChild.name.toLowerCase() === 'host') {
                            selectorPart.children.replace(selectorPart.children.head, csstree.clone(scopeAttributeNode));
                        } else {
                            selectorPart.children.prependData({ type: 'WhiteSpace', value: ' ' });
                            selectorPart.children.prepend(csstree.clone(scopeAttributeNode));
                        }
                    });
                }
            });
            return csstree.generate(ast);
        } catch (e) {
            console.warn(`[Renderer] Failed to scope CSS for ${scopeId}. Error: ${e.message}`);
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
            this._createHtmlProcessorPlugin(renderContext, scripts, componentId)
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