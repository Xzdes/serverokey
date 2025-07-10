// core/renderer.js
// Отвечает за всю логику превращения данных и шаблонов в HTML.

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
        let template = this.assetLoader.getComponentTemplate(componentName);
        if (!template) throw new Error(`Component "${componentName}" not found.`);
        
        // Сначала рендерим все плейсхолдеры {{...}}
        let renderedTemplate = this._renderTemplate(template, globalData);

        // --- НОВАЯ, УМНАЯ ЛОГИКА СТИЛИЗАЦИИ ---
        let finalHtml = renderedTemplate;
        const styleBlocks = [];

        // Ищем все теги <atom:style> и заменяем их по одному
        finalHtml = finalHtml.replace(/<atom:style\s+([^>]+)>([\s\S]*?)<\/atom:style>/g, (match, attrsString, innerContent) => {
            const scopeId = `atom-${Math.random().toString(36).slice(2, 9)}`;
            
            const allAttrs = {};
            attrsString.replace(/([\w:-]+)="([^"]*)"/g, (_, key, value) => {
                allAttrs[key] = value;
            });

            const finalTag = allAttrs.tag || 'div';
            const styleProps = {};
            const dynamicStyles = {};
            const htmlAttrs = {};

            for (const key in allAttrs) {
                if (key === 'tag') continue;

                if (key.includes(':')) {
                    const [state, prop] = key.split(':');
                    if (!dynamicStyles[state]) dynamicStyles[state] = {};
                    dynamicStyles[state][prop] = allAttrs[key];
                } else if (key.startsWith('atom-')) {
                    htmlAttrs[key] = allAttrs[key];
                } else if (!['id', 'class', 'name', 'value', 'type'].includes(key)) {
                    styleProps[key] = allAttrs[key];
                } else {
                    htmlAttrs[key] = allAttrs[key];
                }
            }

            const inlineStyle = Object.entries(styleProps).map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`).join(';');
            
            for (const state in dynamicStyles) {
                const selector = `[data-atom-id="${scopeId}"]:${state}`;
                const rules = Object.entries(dynamicStyles[state]).map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`).join(';');
                styleBlocks.push(`${selector} { ${rules} }`);
            }
            
            const attrsToRender = Object.entries(htmlAttrs).map(([k, v]) => `${k}="${v}"`).join(' ');

            return `<${finalTag} data-atom-id="${scopeId}" style="${inlineStyle}" ${attrsToRender}>${innerContent}</${finalTag}>`;
        });
        
        // Добавляем все собранные стили в начало компонента
        if (styleBlocks.length > 0) {
            finalHtml = `<style>\n${styleBlocks.join('\n')}\n</style>\n` + finalHtml;
        }

        return finalHtml;
    }

    renderView(routeConfig, globalData) {
        let layoutHtml = this.assetLoader.getComponentTemplate(routeConfig.layout);
        layoutHtml = layoutHtml.replace(/<atom-inject into="([^"]+)"><\/atom-inject>/g, (match, placeholderName) => {
            const componentToInject = routeConfig.inject[placeholderName];
            if (componentToInject) {
                return this.renderComponent(componentToInject, globalData);
            }
            return `<!-- AtomEngine: Placeholder '${placeholderName}' not found in manifest -->`;
        });
        return layoutHtml;
    }
}

module.exports = { Renderer };