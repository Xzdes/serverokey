// core/asset-loader.js
const fs = require('fs');
const path = require('path');

class AssetLoader {
    constructor(appPath, manifest) {
        this.appPath = appPath;
        this.manifest = manifest;
        this.actions = {};
        this.components = {};
        this.loadAll();
    }

    loadAll() {
        console.log('[Engine] Caching assets...');
        
        // Кэшируем actions
        for (const route of Object.values(this.manifest.routes)) {
            // --- ИСПРАВЛЕНИЕ ---
            // Загружаем handler, только если он явно указан в маршруте
            if (route.type === 'action' && route.handler && !this.actions[route.handler]) {
                const actionPath = path.join(this.appPath, 'app', 'actions', `${route.handler}.js`);
                try {
                    this.actions[route.handler] = require(actionPath);
                } catch(e) {
                    console.error(`[AssetLoader] CRITICAL: Could not load action file for handler '${route.handler}' from ${actionPath}`);
                    // В случае ошибки, можно либо упасть, либо продолжить с предупреждением.
                    // Для надежности лучше упасть, чтобы разработчик сразу увидел проблему.
                    throw e;
                }
            }
        }

        // Кэшируем components
        for (const componentName in this.manifest.components) {
            const config = this.manifest.components[componentName];
            const componentData = { template: null, style: null };
            
            if (typeof config === 'string') {
                 const templatePath = path.join(this.appPath, 'app', 'components', config);
                 componentData.template = fs.readFileSync(templatePath, 'utf-8');
            } 
            else if (typeof config === 'object' && config.template) {
                 const templatePath = path.join(this.appPath, 'app', 'components', config.template);
                 componentData.template = fs.readFileSync(templatePath, 'utf-8');
                 
                 if (config.style) {
                     const stylePath = path.join(this.appPath, 'app', 'components', config.style);
                     try {
                        componentData.style = fs.readFileSync(stylePath, 'utf-8');
                     } catch (e) {
                        console.warn(`[AssetLoader] Style file not found for component '${componentName}': ${stylePath}`);
                        componentData.style = '';
                     }
                 }
            }
            this.components[componentName] = componentData;
        }
    }

    getAction(name) { return this.actions[name]; }
    getComponent(name) { return this.components[name]; }
}

module.exports = { AssetLoader };