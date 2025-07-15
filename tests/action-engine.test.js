const path = require('path');
const fs = require('fs/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очистка кэша для всех используемых модулей ядра
const ACTION_ENGINE_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/action-engine.js');
if (require.cache[ACTION_ENGINE_PATH]) delete require.cache[ACTION_ENGINE_PATH];
const ASSET_LOADER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/asset-loader.js');
if (require.cache[ASSET_LOADER_PATH]) delete require.cache[ASSET_LOADER_PATH];
const REQUEST_HANDLER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/request-handler.js');
if (require.cache[REQUEST_HANDLER_PATH]) delete require.cache[REQUEST_HANDLER_PATH];
const CONNECTOR_MANAGER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/connector-manager.js');
if (require.cache[CONNECTOR_MANAGER_PATH]) delete require.cache[CONNECTOR_MANAGER_PATH];

/**
 * Вспомогательная функция для логирования.
 */
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) {
        const replacer = (key, value) => {
            if (key === 'zod') return '[Zod Object]';
            if (typeof value === 'bigint') return value.toString();
            return value;
        };
        console.log(JSON.stringify(data, replacer, 2));
    }
}

/**
 * Вспомогательная функция для проверки утверждений.
 */
function check(condition, description, actual) {
    if (condition) {
        console.log(`  ✅ OK: ${description}`);
    } else {
        console.error(`  ❌ FAILED: ${description}`);
        if (actual !== undefined) {
            console.error('     ACTUAL VALUE:', actual);
        }
        throw new Error(`Assertion failed: ${description}`);
    }
}

/**
 * Инициализирует ActionEngine. appPath предоставляется runner'ом.
 */
function setupActionEngine(appPath, initialContext, assetLoader = null, requestHandler = null) {
    const { ActionEngine } = require(ACTION_ENGINE_PATH);
    const engine = new ActionEngine(initialContext, appPath, assetLoader, requestHandler, true);
    return engine;
}


// --- Тестовые Сценарии ---

async function runSetStepTest(appPath) {
    log('--- Test: runSetStepTest ---');
    const initialContext = {
        data: { cart: { items: [], total: 0 } },
        body: { price: 150 }
    };
    const engine = setupActionEngine(appPath, initialContext);

    const steps = [
        { "set": "data.cart.total", "to": "Number(100)" },
        { "set": "context.newItem", "to": "{ id: 1, name: 'Product' }" },
        { "set": "data.cart.items", "to": "data.cart.items.concat([context.newItem])" }
    ];

    await engine.run(steps);
    const finalContext = engine.context;
    
    check(finalContext.data.cart.total === 100, 'Step "set" should assign a simple value.');
    check(finalContext.data.cart.items.length === 1, 'Step "set" should add an item to the array.');
}

async function runIfThenElseStepTest(appPath) {
    log('--- Test: runIfThenElseStepTest ---');
    const initialContext = {
        data: { user: { role: 'admin' } },
        body: { action: 'deny' }
    };
    const engine = setupActionEngine(appPath, initialContext);

    const steps = [
        {
            "if": "data.user.role === 'admin' && body.action === 'approve'",
            "then": [ { "set": "context.decision", "to": "'approved'" } ],
            "else": [ { "set": "context.decision", "to": "'denied'" } ]
        }
    ];

    await engine.run(steps);
    const finalContext = engine.context;
    
    check(finalContext.context.decision === 'denied', 'Step "if/else" should be executed when condition is false.');
}

async function runRunStepTest(appPath) {
    log('--- Test: runRunStepTest ---');
    const { AssetLoader } = require(ASSET_LOADER_PATH);
    const assetLoader = new AssetLoader(appPath, { components: {} });

    const initialContext = { data: {}, body: { a: 5, b: 10 } };
    const engine = setupActionEngine(appPath, initialContext, assetLoader);

    const steps = [{ "run": "myTestAction" }];
    await engine.run(steps);
    const finalContext = engine.context;

    check(finalContext.data.sum === 15, 'Step "run" should execute code from an external file.');
}

async function runActionRunStepTest(appPath) {
    log('--- Test: runActionRunStepTest ---');
    const { AssetLoader } = require(ASSET_LOADER_PATH);
    const { RequestHandler } = require(REQUEST_HANDLER_PATH);
    const { ConnectorManager } = require(CONNECTOR_MANAGER_PATH);

    const manifestInstance = require(path.join(appPath, 'manifest.js'));
    const connectorManager = new ConnectorManager(appPath, manifestInstance);
    const assetLoader = new AssetLoader(appPath, manifestInstance);
    const requestHandler = new RequestHandler(manifestInstance, connectorManager, assetLoader, null, appPath);

    const initialContext = {
        data: { cart: { items: [{ price: 100 }], total: 100 } },
        body: { price: 50 }
    };
    
    const engine = setupActionEngine(appPath, initialContext, assetLoader, requestHandler);

    const routeConfig = manifestInstance.routes['POST /addItem'];
    await engine.run(routeConfig.steps);
    const finalContext = engine.context;

    check(finalContext.data.cart.items.length === 2, 'The item should be added to the cart.');
    check(finalContext.data.cart.total === 150, 'Step "action:run" should have recalculated the total correctly.');
}


// --- Экспорт Тестов для Runner'а ---

module.exports = {
    'ActionEngine: Step "set" should correctly modify context': {
        options: {
            // Этот тест не требует файлов или манифеста, так как работает в памяти
        },
        run: runSetStepTest
    },
    'ActionEngine: Step "if/then/else" should work correctly': {
        options: {},
        run: runIfThenElseStepTest
    },
    'ActionEngine: Step "run" should execute an external action file': {
        options: {
            files: {
                // Runner создаст этот файл во временной папке 'app/actions/'
                'app/actions/myTestAction.js': `module.exports = (ctx, body) => { ctx.data.sum = body.a + body.b; };`
            }
        },
        run: runRunStepTest
    },
    'ActionEngine: Step "action:run" should call another action': {
        options: {
            // Runner создаст manifest.js с этим содержимым
            manifest: {
                components: {},
                connectors: {},
                routes: {
                    "calculateTotal": {
                        "type": "action", "internal": true,
                        "steps": [{ "set": "data.cart.total", "to": "data.cart.items.reduce((sum, item) => sum + item.price, 0)" }]
                    },
                    "POST /addItem": {
                        "type": "action",
                        "steps": [
                            { "set": "data.cart.items", "to": "data.cart.items.concat([{ price: body.price }])" },
                            { "action:run": { "name": "calculateTotal" } }
                        ]
                    }
                }
            }
        },
        run: runActionRunStepTest
    }
};