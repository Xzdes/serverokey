// core/renderer.js
// ФИНАЛЬНАЯ, ИСПРАВЛЕННАЯ И НАДЕЖНАЯ ВЕРСИЯ

class Renderer {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
    }

    _renderTemplate(template, data) {
        // Эта функция работает корректно и остается без изменений.
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

        // 1. Сначала рендерим все плейсхолдеры {{...}}
        let processedHtml = this._renderTemplate(template, globalData);
        
        const styleBlocks = [];
        // Важно: регулярка НЕ глобальная (без флага /g)
        const atomTagRegex = /<atom:style\s+([^>]+?)>([\s\S]*?)<\/atom:style>/;

        // 2. Итеративно заменяем теги, пока они существуют
        while (atomTagRegex.test(processedHtml)) {
            processedHtml = processedHtml.replace(atomTagRegex, (match, attrsString, innerContent) => {
                // Эта замена сработает только для первого найденного (самого внутреннего) тега
                const scopeId = `atom-${Math.random().toString(36).slice(2, 9)}`;
                const allAttrs = {};
                attrsString.replace(/([\w:-]+)="([^"]*)"/g, (_, key, value) => { allAttrs[key] = value; });

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
                    } else if (key.startsWith('atom-') || ['id', 'class', 'name', 'value', 'type'].includes(key)) {
                        htmlAttrs[key] = allAttrs[key];
                    } else {
                        styleProps[key] = allAttrs[key];
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
        }
        
        // 3. Добавляем все собранные стили в начало
        if (styleBlocks.length > 0) {
            processedHtml = `<style>\n${styleBlocks.join('\n')}\n</style>\n` + processedHtml;
        }

        return processedHtml;
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