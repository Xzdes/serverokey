// core/renderer.js
const Mustache = require('./mustache.js');

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

    _processDirectives(html, dataContext) {
        const regex = /<([a-zA-Z0-9\-]+)[^>]*?\satom-if="([^"]+)"[^>]*?>([\s\S]*?)<\/\1>/g;
        const evaluateCondition = (condition) => {
            try {
                const contextKeys = Object.keys(dataContext);
                const contextValues = Object.values(dataContext);
                const func = new Function(...contextKeys, `return ${condition};`);
                return func(...contextValues);
            } catch (e) {
                console.warn(`[Renderer] Could not evaluate atom-if condition: "${condition}"`, e.message);
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

    _processClientScripts(html, componentId) {
        const scripts = [];
        const scriptRegex = /<script\s+atom-run>([\s\S]*?)<\/script>/g;
        
        const processedHtml = html.replace(scriptRegex, (match, scriptContent) => {
            scripts.push({
                id: componentId,
                code: scriptContent.trim()
            });
            return '';
        });

        return { html: processedHtml, scripts };
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
    
    async renderComponent(componentName, dataContext = {}) {
        const component = this.assetLoader.getComponent(componentName);
        if (!component) throw new Error(`Component "${componentName}" not found.`);
        const componentId = `c-${Math.random().toString(36).slice(2, 9)}`;
        
        const globalContext = await this._getGlobalContext();
        const renderContext = { ...globalContext, ...dataContext, _internal: { id: componentId } };
        
        let html = Mustache.render(component.template, renderContext);
        html = this._processDirectives(html, renderContext);
        
        const scriptProcessingResult = this._processClientScripts(html, componentId);
        html = scriptProcessingResult.html;
        const scripts = scriptProcessingResult.scripts;

        html = html.replace(/<([a-zA-Z0-9\-]+)/, `<$1 data-component-id="${componentId}"`);
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