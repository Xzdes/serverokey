// core/renderer.js - Использует Mustache.js для рендеринга.
const Mustache = require('./mustache.js'); // Путь к файлу внутри папки core

class Renderer {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
        // Отключаем HTML-экранирование по умолчанию.
        Mustache.escape = function(text) { return text; };
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
        if (!component) {
            throw new Error(`Component "${componentName}" not found.`);
        }

        let html = Mustache.render(component.template, globalData);

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
        
        let layoutHtml = layoutComponent.template.replace(/<atom-inject into="([^"]+)"><\/atom-inject>/g, (match, placeholderName) => {
            return injectedHtml[placeholderName] || `<!-- AtomEngine: Placeholder '${placeholderName}' not found -->`;
        });
        
        if (allStyles.size > 0) {
            const styleTag = `<style>\n${[...allStyles].join('\n')}\n</style>`;
            layoutHtml = layoutHtml.replace('</head>', `${styleTag}\n</head>`);
        }
        return layoutHtml;
    }
}

module.exports = { Renderer };