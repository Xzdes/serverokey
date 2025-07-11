// core/renderer.js
class Renderer {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
    }

    _renderTemplate(template, data) {
        template = template.replace(/{{#each ([\w.]+)}}(.*?){{\/each}}/gs, (match, key, block) => {
            const items = key.split('.').reduce((o, i) => o?.[i], data) || [];
            return items.map((item, index) => {
                const innerData = { ...data, this: item, '@index': index };
                return this._renderTemplate(block, innerData);
            }).join('');
        });
        return template.replace(/{{(.*?)}}/g, (match, key) => {
            const value = key.trim().split('.').reduce((o, i) => o?.[i], data);
            return value !== undefined ? value : '';
        });
    }

    _scopeCss(css, scopeId) {
        if (!css) return '';

        // 1. Сначала удаляем все CSS-комментарии, чтобы они не мешали парсеру.
        // Это делает регулярное выражение гораздо более надежным.
        const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // 2. Используем тот же regex, но уже на очищенном CSS.
        // Он находит селекторы, игнорируя @-правила (например, @media, @keyframes).
        const regex = /((?:^|}|,)\s*)([^{}@,]+)((?:\s*,\s*[^{}@,]+)*)(\s*{)/g;
        
        return cssWithoutComments.replace(regex, (match, p1, mainSelector, otherSelectors, p4) => {
            // Объединяем все селекторы (например, "h1, h2, h3") в один массив
            const allSelectors = (mainSelector + (otherSelectors || '')).split(',');
            
            const scopedSelectors = allSelectors.map(selector => {
                const trimmed = selector.trim();
                if (!trimmed) return ''; // Пропускаем пустые селекторы, если они вдруг появятся

                // Правильно заменяем :host на сам селектор-атрибут
                if (trimmed === ':host') {
                    return `[data-component-id="${scopeId}"]`;
                }
                // Для всех остальных селекторов — добавляем атрибут в начало
                return `[data-component-id="${scopeId}"] ${trimmed}`;
            }).filter(Boolean).join(', '); // .filter(Boolean) убирает пустые строки

            // Возвращаем полностью собранное и корректное правило
            return `${p1}${scopedSelectors}${p4}`;
        });
    }
    
    renderComponent(componentName, globalData) {
        const component = this.assetLoader.getComponent(componentName);
        if (!component) {
            throw new Error(`Component "${componentName}" not found.`);
        }

        let html = this._renderTemplate(component.template, globalData);
        const componentId = `c-${Math.random().toString(36).slice(2, 9)}`;
        
        // Применяем уникальный атрибут к корневому элементу
        html = html.replace(/<([a-z0-9]+)/, `<$1 data-component-id="${componentId}"`);
        
        // Обрабатываем и изолируем CSS
        const styles = this._scopeCss(component.style, componentId);

        return { html, styles };
    }

    renderView(routeConfig, globalData) {
        const layoutComponent = this.assetLoader.getComponent(routeConfig.layout);
        if (!layoutComponent) throw new Error(`Layout "${routeConfig.layout}" not found.`);
        
        let layoutHtml = layoutComponent.template;
        const allStyles = new Set();

        layoutHtml = layoutHtml.replace(/<atom-inject into="([^"]+)"><\/atom-inject>/g, (match, placeholderName) => {
            const componentName = routeConfig.inject[placeholderName];
            if (componentName) {
                const { html, styles } = this.renderComponent(componentName, globalData);
                if (styles) allStyles.add(styles);
                return `<div id="${componentName}-container">${html}</div>`;
            }
            return `<!-- AtomEngine: Placeholder '${placeholderName}' not found -->`;
        });
        
        if (allStyles.size > 0) {
            const styleTag = `<style>\n${[...allStyles].join('\n')}\n</style>`;
            layoutHtml = layoutHtml.replace('</head>', `${styleTag}\n</head>`);
        }
        return layoutHtml;
    }
}

module.exports = { Renderer };