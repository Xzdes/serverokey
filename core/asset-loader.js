// core/asset-loader.js
// Переписываем полностью. Он теперь должен правильно обрабатывать новую структуру компонентов.
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
            const config = this.manifest.components[componentName];
            
            // Если значение - строка, это простой компонент (как mainLayout)
            if(typeof config === 'string') {
                 const componentPath = path.join(this.appPath, 'app', 'components', config);
                 this.components[componentName] = {
                     template: fs.readFileSync(componentPath, 'utf-8'),
                     styles: {} // Нет стилей для простых компонентов
                 };
            } 
            // Если это объект, это стилизованный компонент
            else if (typeof config === 'object' && config.template) {
                 const componentPath = path.join(this.appPath, 'app', 'components', config.template);
                 this.components[componentName] = {
                     template: fs.readFileSync(componentPath, 'utf-8'),
                     styles: config.styles || {}
                 };
            }
        }
    }

    getAction(name) { return this.actions[name]; }
    getComponent(name) { return this.components[name]; }
}

module.exports = { AssetLoader };