// core/renderer.js - Добавлена поддержка директивы atom-if
const Mustache = require('./mustache.js');
const { FormulaParser } = require('./formula-parser.js'); // Нам понадобится наш парсер

class Renderer {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
        Mustache.escape = function(text) { return text; };
    }
    
    // --- НОВЫЙ МЕТОД ДЛЯ ОБРАБОТКИ ДИРЕКТИВ ---
_processDirectives(html, dataContext) {
    const regex = /<([a-zA-Z0-9\-]+)[^>]*?\satom-if="([^"]+)"[^>]*?>([\s\S]*?)<\/\1>/g;
    const parser = new FormulaParser(dataContext.receipt); // Контекст должен быть конкретным объектом

    const evaluateCondition = (condition) => {
        // Заменяем dot-notation на переменные, которые парсер поймет
        const simplifiedCondition = condition.replace(/(\w+)\.(\w+)\.length/, (match, obj, prop) => {
             // Превращаем 'receipt.items.length' в реальное число
            return dataContext[obj] && dataContext[obj][prop] ? dataContext[obj][prop].length : 0;
        });
        
        try {
            return new Function(`return ${simplifiedCondition}`)();
        } catch(e) {
            return false;
        }
    };
    
    let oldHtml;
    do {
        oldHtml = html;
        html = html.replace(regex, (match, tagName, condition, content) => {
            if (evaluateCondition(condition)) {
                return match.replace(/\satom-if="[^"]+"/, '');
            } else {
                return '';
            }
        });
    } while (oldHtml !== html);

    return html;
}

    _scopeCss(css, scopeId) {
        // ... (без изменений)
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

        // --- НОВЫЙ ШАГ: ОБРАБОТКА ДИРЕКТИВ ---
        // Мы передаем весь globalData, чтобы у директив был доступ ко всем переменным
        html = this._processDirectives(html, globalData);

        const componentId = `c-${Math.random().toString(36).slice(2, 9)}`;
        
        html = html.replace(/<([a-zA-Z0-9]+)/, `<$1 data-component-id="${componentId}"`);
        
        const styles = this._scopeCss(component.style, componentId);

        return { html, styles };
    }

    renderView(routeConfig, globalData) {
        // ... (без изменений, т.к. renderComponent теперь сам обрабатывает директивы)
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