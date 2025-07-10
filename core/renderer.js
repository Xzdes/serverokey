// core/renderer.js
// ФИНАЛЬНАЯ ВЕРСИЯ 2.0. Исправлена логика парсинга атрибутов.

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
        const template = this.assetLoader.getComponentTemplate(componentName);
        if (!template) {
            throw new Error(`Component template "${componentName}" not found.`);
        }

        let processedHtml = this._renderTemplate(template, globalData);
        const collectedStyles = [];
        const atomTagRegex = /<atom:style\s+([^>]+?)>([\s\S]*?)<\/atom:style>/;

        while (atomTagRegex.test(processedHtml)) {
            processedHtml = processedHtml.replace(atomTagRegex, (match, attrsString, innerContent) => {
                const scopeId = `atom-${Math.random().toString(36).slice(2, 9)}`;
                const allAttrs = {};
                attrsString.replace(/([\w:-]+)="([^"]*)"/g, (_, key, value) => { allAttrs[key] = value; });

                const finalTag = allAttrs.tag || 'div';
                const styleProps = {}, dynamicStyles = {}, htmlAttrs = {};

                for (const key in allAttrs) {
                    if (key === 'tag') continue;

                    // --- ИСПРАВЛЕННАЯ ЛОГИКА ---
                    if (key.includes(':')) {
                        const [state, prop] = key.split(':');
                        if (!dynamicStyles[state]) dynamicStyles[state] = {};
                        dynamicStyles[state][prop] = allAttrs[key];
                    } else if (key.startsWith('atom-') || /^(id|class|name|value|type|for|placeholder|src|alt|href|target)$/.test(key)) {
                        // Если это стандартный HTML атрибут или наш `atom-`
                        htmlAttrs[key] = allAttrs[key];
                    } else {
                        // Все остальное считаем CSS-свойством для инлайн-стилей
                        styleProps[key] = allAttrs[key];
                    }
                }

                const inlineStyle = Object.entries(styleProps).map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`).join(';');
                
                for (const state in dynamicStyles) {
                    const selector = `[data-atom-id="${scopeId}"]:${state}`;
                    const rules = Object.entries(dynamicStyles[state]).map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`).join(';');
                    collectedStyles.push(`${selector} { ${rules} }`);
                }
                
                const attrsToRender = Object.entries(htmlAttrs).map(([k, v]) => `${k}="${v}"`).join(' ');
                return `<${finalTag} data-atom-id="${scopeId}" style="${inlineStyle}" ${attrsToRender}>${innerContent}</${finalTag}>`;
            });
        }
        
        return { html: processedHtml, styles: collectedStyles };
    }

    renderView(routeConfig, globalData) {
        let layoutHtml = this.assetLoader.getComponentTemplate(routeConfig.layout);
        const allStyles = [];

        layoutHtml = layoutHtml.replace(/<atom-inject into="([^"]+)"><\/atom-inject>/g, (match, placeholderName) => {
            const componentToInject = routeConfig.inject[placeholderName];
            if (componentToInject) {
                const { html, styles } = this.renderComponent(componentToInject, globalData);
                allStyles.push(...styles);
                return html;
            }
            return `<!-- AtomEngine: Placeholder '${placeholderName}' not found in manifest -->`;
        });
        
        if (allStyles.length > 0) {
            const styleTag = `<style>\n${allStyles.join('\n')}\n</style>`;
            layoutHtml = layoutHtml.replace('</head>', `${styleTag}\n</head>`);
        }

        return layoutHtml;
    }
}

module.exports = { Renderer };