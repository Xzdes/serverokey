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

    // УЛУЧШЕННАЯ И БОЛЕЕ НАДЕЖНАЯ ВЕРСИЯ
    _scopeCss(css, scopeId) {
        if (!css) return '';
        try {
            const ast = csstree.parse(css, { onParseError: (e) => { /* Игнорируем ошибки парсинга CSS, но это может привести к невалидному AST */ } });
            const scopeAttr = `[data-component-id="${scopeId}"]`;
            // ИСПРАВЛЕНИЕ: Используем csstree.find для надежного поиска узла.
            // Это решает ошибку "children.first is not a function" и делает код более устойчивым.
            const selectorAst = csstree.parse(scopeAttr, { context: 'selector' });
            const attributeSelectorNode = csstree.find(selectorAst, node => node.type === 'AttributeSelector');

            if (!attributeSelectorNode) {
                // Этого не должно произойти, но на всякий случай добавим защиту.
                console.warn(`[Renderer] Could not create a scope attribute node for ${scopeId}.`);
                return css;
            }

            csstree.walk(ast, {
                visit: 'Selector',
                enter: (node) => {
                    // ЗАЩИТА: Проверяем, что node.children является валидным списком css-tree.
                    // Из-за игнорирования ошибок парсинга, структура AST может быть нарушена.
                    if (!node.children || typeof node.children.isEmpty !== 'function' || node.children.isEmpty()) {
                        return;
                    }
                    
                    const firstChild = node.children.head ? node.children.head.data : null;
                    if (!firstChild) {
                        return;
                    }

                    // :host заменяется на атрибут компонента
                    if (firstChild.type === 'PseudoClassSelector' && firstChild.name.toLowerCase() === 'host') {
                        // ОКОНЧАТЕЛЬНОЕ ИСПРАВЛЕНИЕ: Заменяем :host на атрибут компонента.
                        // Вместо сложного `replace`, удаляем узел :host и добавляем атрибут в начало.
                        node.children.remove(node.children.head);
                        node.children.prepend(node.children.createItem(csstree.clone(attributeSelectorNode)));
                        return;
                    }

                    // Не добавляем скоуп к селекторам анимаций (@keyframes) и глобальным селекторам (html, body, :root)
                    const selectorName = firstChild.name ? firstChild.name.toLowerCase() : '';
                    if (
                        firstChild.type === 'Percentage' ||
                        (firstChild.type === 'TypeSelector' && (selectorName === 'from' || selectorName === 'to' || selectorName === 'html' || selectorName === 'body')) ||
                        (firstChild.type === 'PseudoClassSelector' && selectorName === 'root')
                    ) {
                        return;
                    }
                    
                    // ИСПРАВЛЕНИЕ: Используем prependList для атомарного и корректного добавления.
                    // Это предотвращает ошибки при манипуляции списком.
                    const listToPrepend = new csstree.List();
                    listToPrepend.appendData(csstree.clone(attributeSelectorNode));
                    listToPrepend.appendData({ type: 'WhiteSpace', value: ' ' });
                    node.children.prependList(listToPrepend);
                }
            });
            return csstree.generate(ast);
        } catch (e) {
            // ИСПРАВЛЕНИЕ: Прекращаем "тихое" подавление ошибок. Если скоупинг не удался, это критическая ошибка.
            console.error(`[Renderer] A critical error occurred while scoping CSS for ${scopeId}. Error:`, e);
            throw new Error(`CSS scoping failed for component ${scopeId}`);
        }
    }

    async renderComponent(componentName, dataContext = {}, globalContext = {}) {
        const component = this.assetLoader.getComponent(componentName);
        if (!component) throw new Error(`Component "${componentName}" not found.`);

        const componentId = `c-${Math.random().toString(36).slice(2, 9)}`;
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

        const globalContext = await this._getGlobalContext();

        const allStyleTags = [];
        const allScripts = [];
        const injectedHtml = {};

        const dataForInjectedComponents = await this.connectorManager.getContext(routeConfig.reads || []);
        const renderData = { ...globalData, ...dataForInjectedComponents };

        for (const placeholderName in routeConfig.inject) {
            const componentName = routeConfig.inject[placeholderName];
            if (componentName) {
                const { html, styles, scripts } = await this.renderComponent(componentName, renderData, globalContext);
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
        layoutHtml = Mustache.render(layoutHtml, globalContext);

        if (allStyleTags.length > 0) {
            const styleTag = allStyleTags.join('\n');
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