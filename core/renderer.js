// core/renderer.js (Переписан полностью, с финальным исправлением atom-if)
const Mustache = require('./mustache.js');
const { FormulaParser } = require('./formula-parser.js');

class Renderer {
    constructor(assetLoader, manifest, dataManager) {
        this.assetLoader = assetLoader;
        this.manifest = manifest;
        this.dataManager = dataManager;
        this.globalContext = this._createGlobalContext();
        Mustache.escape = function(text) { return text; };
    }

    _createGlobalContext() {
        const context = {};
        const globalsConfig = this.manifest.globals;
        if (!globalsConfig) return context;
        for (const key in globalsConfig) {
            if (key !== 'injectData') {
                context[key] = globalsConfig[key];
            }
        }
        if (Array.isArray(globalsConfig.injectData)) {
            globalsConfig.injectData.forEach(dataKey => {
                context[dataKey] = this.dataManager.get(dataKey);
            });
        }
        console.log('[Engine] Global context created:', context);
        return context;
    }

    // --- ИСПРАВЛЕННЫЙ МЕТОД ---
    _processDirectives(html, dataContext) {
        // Regex ищет теги с atom-if и их содержимое
        const regex = /<([a-zA-Z0-9\-]+)[^>]*?\satom-if="([^"]+)"[^>]*?>([\s\S]*?)<\/\1>/g;

        const evaluateCondition = (condition) => {
            try {
                // Создаем контекст для безопасной функции, передавая все нужные данные
                const contextKeys = Object.keys(dataContext);
                const contextValues = Object.values(dataContext);

                // Создаем функцию, которая принимает наши данные как аргументы
                const func = new Function(...contextKeys, `return ${condition};`);
                // Вызываем ее, передавая значения
                return func(...contextValues);
            } catch (e) {
                console.warn(`[Renderer] Could not evaluate atom-if condition: "${condition}"`, e.message);
                return false;
            }
        };
        
        // Итеративно заменяем, чтобы обработать вложенные директивы
        let oldHtml;
        do {
            oldHtml = html;
            html = html.replace(regex, (match, tagName, condition, content) => {
                if (evaluateCondition(condition)) {
                    // Условие истинно, убираем только атрибут atom-if
                    return match.replace(/\satom-if="[^"]+"/, '');
                } else {
                    // Условие ложно, удаляем весь элемент
                    return '';
                }
            });
        } while (oldHtml !== html);

        return html;
    }

    _scopeCss(css, scopeId) {
        if (!css) return '';
        const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
        const regex = /((?:^|}|,)\s*)([^{}@,]+)((?:\s*,\s*[^{}@,]+)*)(\s*{)/g;
        return cssWithoutComments.replace(regex, (match, p1, mainSelector, otherSelectors, p4) => {
            const allSelectors = (mainSelector + (otherSelectors || '')).split(',');
            const scopedSelectors = allSelectors.map(selector => {
                const trimmed = selector.trim();
                if (!trimmed) return '';
                if (trimmed === ':host') {
                    return `[data-component-id="${scopeId}"]`;
                }
                return `[data-component-id="${scopeId}"] ${trimmed}`;
            }).filter(Boolean).join(', ');
            return `${p1}${scopedSelectors}${p4}`;
        });
    }
    
    renderComponent(componentName, globalData) {
        const component = this.assetLoader.getComponent(componentName);
        if (!component) throw new Error(`Component "${componentName}" not found.`);
        const renderContext = { ...this.globalContext, ...globalData };
        let html = Mustache.render(component.template, renderContext);
        html = this._processDirectives(html, renderContext);
        const componentId = `c-${Math.random().toString(36).slice(2, 9)}`;
        html = html.replace(/<([a-z0-9]+)/, `<$1 data-component-id="${componentId}"`);
        const styles = this._scopeCss(component.style, componentId);
        return { html, styles };
    }

    renderView(routeConfig, globalData) {
        const layoutComponent = this.assetLoader.getComponent(routeConfig.layout);
        if (!layoutComponent) throw new Error(`Layout "${routeConfig.layout}" not found.`);
        const allStyles = new Set();
        const injectedHtml = {};
        for (const placeholderName in routeConfig.inject) {
            const componentName = routeConfig.inject[placeholderName];
            if (componentName) {
                const { html, styles } = this.renderComponent(componentName, globalData);
                if (styles) allStyles.add(styles);
                injectedHtml[placeholderName] = `<div id="${componentName}-container">${html}</div>`;
            }
        }
        const layoutContext = { ...this.globalContext, ...globalData };
        let layoutHtml = layoutComponent.template.replace(/<atom-inject into="([^"]+)"><\/atom-inject>/g, (match, placeholderName) => {
            return injectedHtml[placeholderName] || `<!-- ... -->`;
        });
        layoutHtml = Mustache.render(layoutHtml, layoutContext);
        if (allStyles.size > 0) {
            const styleTag = `<style>\n${[...allStyles].join('\n')}\n</style>`;
            layoutHtml = layoutHtml.replace('</head>', `${styleTag}\n</head>`);
        }
        return layoutHtml;
    }
}

module.exports = { Renderer };