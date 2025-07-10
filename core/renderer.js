// core/renderer.js
// Переписываем полностью.

class Renderer {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
    }

    _renderTemplate(template, data) {
        template = template.replace(/{{#each ([\w.]+)}}(.*?){{\/each}}/gs, (match, key, block) => {
            const items = key.split('.').reduce((o, i) => o?.[i], data) || [];
            return items.map(item => this._renderTemplate(block, { ...data, this: item })).join('');
        });
        return template.replace(/{{(.*?)}}/g, (match, key) => {
            const value = key.trim().split('.').reduce((o, i) => o?.[i], data);
            return value !== undefined ? value : '';
        });
    }
    
    renderComponent(componentName, globalData) {
        const component = this.assetLoader.getComponent(componentName);
        if (!component) {
            throw new Error(`Component "${componentName}" not found.`);
        }

        let html = this._renderTemplate(component.template, globalData);
        const collectedStyles = [];
        const componentId = `c-${Math.random().toString(36).slice(2, 9)}`;
        
        for (const selector in component.styles) {
            const rules = component.styles[selector];
            // Используем data-атрибут для уникальности
            const targetSelector = selector === '#' ? `[data-component-id="${componentId}"]` : `[data-component-id="${componentId}"] ${selector}`;
            
            const staticRules = {}, dynamicRules = {};

            for (const prop in rules) {
                if (prop.includes(':')) {
                    const [state, cssProp] = prop.split(':');
                    if (!dynamicRules[state]) dynamicRules[state] = {};
                    dynamicRules[state][cssProp] = rules[prop];
                } else {
                    staticRules[prop] = rules[prop];
                }
            }
            if (Object.keys(staticRules).length > 0) {
                 const staticCss = Object.entries(staticRules).map(([k,v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`).join(';');
                 collectedStyles.push(`${targetSelector} { ${staticCss} }`);
            }
            for (const state in dynamicRules) {
                const stateSelector = `${targetSelector}:${state}`;
                const stateCss = Object.entries(dynamicRules[state]).map(([k,v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`).join(';');
                collectedStyles.push(`${stateSelector} { ${stateCss} }`);
            }
        }
        
        // Добавляем уникальный data-атрибут. ID больше не нужен здесь.
        html = html.replace(/<([a-z0-9]+)/, `<$1 data-component-id="${componentId}"`);

        return { html, styles: collectedStyles };
    }

    renderView(routeConfig, globalData) {
        const layoutComponent = this.assetLoader.getComponent(routeConfig.layout);
        if (!layoutComponent) throw new Error(`Layout "${routeConfig.layout}" not found.`);
        
        let layoutHtml = layoutComponent.template;
        const allStyles = [];

        layoutHtml = layoutHtml.replace(/<atom-inject into="([^"]+)"><\/atom-inject>/g, (match, placeholderName) => {
            const componentName = routeConfig.inject[placeholderName];
            if (componentName) {
                 // --- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ---
                const { html, styles } = this.renderComponent(componentName, globalData);
                allStyles.push(...styles);
                // Создаем обертку с ID для таргетинга
                return `<div id="${componentName}-container">${html}</div>`;
            }
            return `<!-- AtomEngine: Placeholder '${placeholderName}' not found -->`;
        });
        
        if (allStyles.length > 0) {
            const styleTag = `<style>\n${[...new Set(allStyles)].join('\n')}\n</style>`;
            layoutHtml = layoutHtml.replace('</head>', `${styleTag}\n</head>`);
        }
        return layoutHtml;
    }
}

module.exports = { Renderer };