// core/asset-loader.js
// Кэширует в память actions и шаблоны компонентов.
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
            if (route.type === 'action' && !this.actions[route.handler]) {
                const actionPath = path.join(this.appPath, 'app', 'actions', `${route.handler}.js`);
                this.actions[route.handler] = require(actionPath);
            }
        }
        // Кэшируем components
        for (const componentName in this.manifest.components) {
            const fileName = this.manifest.components[componentName];
            const componentPath = path.join(this.appPath, 'app', 'components', fileName);
            this.components[componentName] = fs.readFileSync(componentPath, 'utf-8');
        }
    }

    getAction(name) { return this.actions[name]; }
    getComponentTemplate(name) { return this.components[name]; }
}

module.exports = { AssetLoader };