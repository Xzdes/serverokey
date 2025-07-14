const path = require('path');
const fs = require('fs/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Пути к модулям
const ACTION_ENGINE_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/action-engine.js');
const ASSET_LOADER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/asset-loader.js');
const REQUEST_HANDLER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/request-handler.js');
const CONNECTOR_MANAGER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/connector-manager.js');

// Очистка кэша
if (require.cache[ACTION_ENGINE_PATH]) delete require.cache[ACTION_ENGINE_PATH];
if (require.cache[ASSET_LOADER_PATH]) delete require.cache[ASSET_LOADER_PATH];
if (require.cache[REQUEST_HANDLER_PATH]) delete require.cache[REQUEST_HANDLER_PATH];
if (require.cache[CONNECTOR_MANAGER_PATH]) delete require.cache[CONNECTOR_MANAGER_PATH];

// Вспомогательные функции log и check (без изменений)
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

// Тестовые сценарии (без изменений)
async function runSetStepTest(appPath) {
    const { ActionEngine } = require(ACTION_ENGINE_PATH);
    const initialContext = { data: { cart: { items: [], total: 0 } }, body: { price: 150 } };
    const engine = new ActionEngine(initialContext, appPath, null, null, true);
    const steps = [
        { "set": "data.cart.total", "to": "Number(100)" },
        { "set": "data.cart.items", "to": "[{ id: 1 }]" }
    ];
    await engine.run(steps);
    const finalContext = engine.context;
    check(finalContext.data.cart.total === 100, 'Step "set" should assign a simple value.');
    check(finalContext.data.cart.items.length === 1, 'Step "set" should assign array value.');
}

async function runIfThenElseStepTest(appPath) {
    const { ActionEngine } = require(ACTION_ENGINE_PATH);
    const initialContext = { data: { user: { role: 'admin' } } };
    const engine = new ActionEngine(initialContext, appPath, null, null, true);
    const steps = [
        { "if": "data.user.role === 'admin'", "then": [{ "set": "context.decision", "to": "'approved'" }] }
    ];
    await engine.run(steps);
    check(engine.context.context.decision === 'approved', 'Step "if/then" should be executed.');
}

async function runRunStepTest(appPath) {
    const { ActionEngine } = require(ACTION_ENGINE_PATH);
    const { AssetLoader } = require(ASSET_LOADER_PATH);
    const assetLoader = new AssetLoader(appPath, { components: {} });
    const initialContext = { data: {}, body: { a: 5, b: 10 } };
    const engine = new ActionEngine(initialContext, appPath, assetLoader, null, true);
    const steps = [{ "run": "myTestAction" }];
    await engine.run(steps);
    check(engine.context.data.sum === 15, 'Step "run" should execute code from an external file.');
}

async function runActionRunStepTest(appPath) {
    const { ActionEngine } = require(ACTION_ENGINE_PATH);
    const { AssetLoader } = require(ASSET_LOADER_PATH);
    const { RequestHandler } = require(REQUEST_HANDLER_PATH);
    const { ConnectorManager } = require(CONNECTOR_MANAGER_PATH);
    const manifest = require(path.join(appPath, 'manifest.js'));
    const connectorManager = new ConnectorManager(appPath, manifest);
    const assetLoader = new AssetLoader(appPath, manifest);
    const requestHandler = new RequestHandler(manifest, connectorManager, assetLoader, null, appPath);
    const initialContext = { data: { cart: { items: [], total: 0 } }, body: { price: 50 } };
    const engine = new ActionEngine(initialContext, appPath, assetLoader, requestHandler, true);
    const routeConfig = manifest.routes['POST /addItem'];
    await engine.run(routeConfig.steps);
    check(engine.context.data.cart.total === 50, 'Step "action:run" should have recalculated the total.');
}

// --- Экспорт Тестов для Runner'а ---

module.exports = {
    'ActionEngine: Step "set" should correctly modify context': {
        options: {}, // не требует файлов
        run: runSetStepTest
    },
    'ActionEngine: Step "if/then/else" should work correctly': {
        options: {}, // не требует файлов
        run: runIfThenElseStepTest
    },
    'ActionEngine: Step "run" should execute an external action file': {
        options: {
            files: {
                'app/actions/myTestAction.js': `module.exports = (ctx, body) => { ctx.data.sum = body.a + body.b; };`
            }
        },
        run: runRunStepTest
    },
    'ActionEngine: Step "action:run" should call another action': {
        options: {
            manifest: {
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