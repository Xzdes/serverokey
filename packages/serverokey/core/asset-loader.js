// core/asset-loader.js
const fs = require('fs');
const path = require('path');

class AssetLoader {
    constructor(appPath, manifest) {
        this.appPath = appPath;
        this.manifest = manifest;
        this.actions = {};
        this.components = {};
        this.operations = {};
        this.loadAll();
    }

    loadAll() {
        console.log('[Engine] Caching assets...');
        
        const operationsPath = path.join(this.appPath, 'app', 'operations');
        if (fs.existsSync(operationsPath)) {
            fs.readdirSync(operationsPath).forEach(file => {
                if (file.endsWith('.js')) {
                    const operationName = path.basename(file, '.js');
                    const operationPath = path.join(operationsPath, file);
                    this.operations[operationName] = require(operationPath);
                    console.log(`[AssetLoader] Cached custom operation: '${operationName}'`);
                }
            });
        }
        
        // --- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Загружаем все экшены из папки ---
        const actionsPath = path.join(this.appPath, 'app', 'actions');
        if (fs.existsSync(actionsPath)) {
            fs.readdirSync(actionsPath).forEach(file => {
                if (file.endsWith('.js')) {
                    const actionName = path.basename(file, '.js');
                    const actionPath = path.join(actionsPath, file);
                    try {
                        this.actions[actionName] = require(actionPath);
                        console.log(`[AssetLoader] Cached action: '${actionName}'`);
                    } catch (e) {
                        console.error(`[AssetLoader] CRITICAL: Could not load action file '${actionName}' from ${actionPath}`);
                        throw e;
                    }
                }
            });
        }
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

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
    getOperation(name) { return this.operations[name]; }
}

module.exports = { AssetLoader };