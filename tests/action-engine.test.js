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
 * Улучшенная функция логирования с обработкой BigInt и фильтрацией Zod.
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

function check(condition, description, actual, expected) {
    if (condition) {
        console.log(`  ✅ OK: ${description}`);
    } else {
        console.error(`  ❌ FAILED: ${description}`);
        if (actual !== undefined) console.error('     ACTUAL  :', actual);
        if (expected !== undefined) console.error('     EXPECTED:', expected);
        throw new Error(`Assertion failed: ${description}`);
    }
}

/**
 * Инициализирует ActionEngine.
 */
function setupActionEngine(initialContext, assetLoader = null, requestHandler = null, appPath = PROJECT_ROOT) {
    log('Setting up ActionEngine with context:', initialContext);
    const { ActionEngine } = require(ACTION_ENGINE_PATH);
    const engine = new ActionEngine(initialContext, appPath, assetLoader, requestHandler, true);
    log('ActionEngine setup complete.');
    return engine;
}


// --- Тестовые Сценарии ---

async function runSetStepTest() {
    log('--- Starting Test for "set" step ---');
    const initialContext = {
        data: { cart: { items: [], total: 0 } },
        body: { price: 150 }
    };
    const engine = setupActionEngine(initialContext);

    const steps = [
        { "set": "data.cart.total", "to": "Number(100)" },
        { "set": "data.cart.newPrice", "to": "body.price" },
        { "set": "data.cart.totalWithTax", "to": "Number(data.cart.total) * 1.2" },
        { "set": "context.newItem", "to": "{ id: 1, name: 'Product' }" },
        { "set": "data.cart.items", "to": "data.cart.items.concat([context.newItem])" }
    ];

    log('Running steps:', steps);
    await engine.run(steps);
    const finalContext = engine.context;
    log('Final context for "set" test:', finalContext);

    check(finalContext.data.cart.total === 100, 'Step "set" should assign a simple value.');
    check(finalContext.data.cart.newPrice === 150, 'Step "set" should assign a value from body.');
    check(finalContext.data.cart.totalWithTax === 120, 'Step "set" should perform calculations.');
    check(finalContext.data.cart.items.length === 1, 'Step "set" should add an item to the array.');
    check(finalContext.data.cart.items[0].name === 'Product', 'The added item should have correct properties.');
}

async function runIfThenElseStepTest() {
    log('--- Starting Test for "if/then/else" step ---');
    const initialContext = {
        data: { user: { role: 'admin' }, config: { a: 10, b: 20 } },
        body: { action: 'approve' }
    };
    const engine = setupActionEngine(initialContext);

    const steps = [
        {
            "if": "data.user.role === 'admin' && body.action === 'approve'",
            "then": [ { "set": "context.decision", "to": "'approved'" } ],
            "else": [ { "set": "context.decision", "to": "'denied'" } ]
        },
        {
            "if": "data.config.a > data.config.b",
            "then": [ { "set": "context.comparison", "to": "'A is greater'" } ],
            "else": [ { "set": "context.comparison", "to": "'B is greater or equal'" } ]
        }
    ];

    log('Running steps:', steps);
    await engine.run(steps);
    const finalContext = engine.context;
    log('Final context for "if/then/else" test:', finalContext);
    
    check(finalContext.context.decision === 'approved', 'Step "if/then" should be executed when condition is true.');
    check(finalContext.context.comparison === 'B is greater or equal', 'Step "if/else" should be executed when condition is false.');
}

async function runRunStepTest() {
    log('--- Starting Test for "run" step ---');
    const testName = 'action-engine-run-step';
    const { createTestAppStructure, cleanupTestApp } = require('./_utils/test-setup.js');
    let appPath;

    try {
        const actionFileContent = `
            module.exports = (context, body) => {
                context.data.result = 'Hello from action file!';
                context.data.sum = body.a + body.b;
            };
        `;
        const options = { files: { 'app/actions/myTestAction.js': actionFileContent } };
        appPath = await createTestAppStructure(testName, options);

        log('Setting up environment for "run" step test...');
        const { AssetLoader } = require(ASSET_LOADER_PATH);
        const assetLoader = new AssetLoader(appPath, { components: {} });

        const initialContext = { data: {}, body: { a: 5, b: 10 } };
        const engine = setupActionEngine(initialContext, assetLoader, null, appPath);

        const steps = [{ "run": "myTestAction" }];
        log('Running steps:', steps);
        await engine.run(steps);
        const finalContext = engine.context;
        log('Final context for "run" test:', finalContext);

        check(finalContext.data.result === 'Hello from action file!', 'Step "run" should execute code from an external file.');
        check(finalContext.data.sum === 15, 'Action file should have access to the "body" object.');

    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}

async function runActionRunStepTest() {
    log('--- Starting Test for "action:run" step ---');
    const testName = 'action-engine-action-run-step';
    const { createTestAppStructure, cleanupTestApp } = require('./_utils/test-setup.js');
    let appPath;

    try {
        const manifest = {
            components: {},
            connectors: {},
            routes: {
                "calculateTotal": {
                    "type": "action", "internal": true,
                    "steps": [ { "set": "data.cart.total", "to": "data.cart.items.reduce((sum, item) => sum + item.price, 0)" } ]
                },
                "POST /addItem": {
                    "type": "action",
                    "steps": [
                        { "set": "data.cart.items", "to": "data.cart.items.concat([{ price: body.price }])" },
                        { "action:run": { "name": "calculateTotal" } }
                    ]
                }
            }
        };

        const options = { manifest };
        appPath = await createTestAppStructure(testName, options);

        log('Setting up environment for "action:run" step test...');
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
        
        const engine = setupActionEngine(initialContext, assetLoader, requestHandler, appPath);

        const routeConfig = manifest.routes['POST /addItem'];
        log('Running steps:', routeConfig.steps);
        await engine.run(routeConfig.steps);
        const finalContext = engine.context;
        log('Final context for "action:run" test:', finalContext);

        check(finalContext.data.cart.items.length === 2, 'The item should be added to the cart.');
        check(finalContext.data.cart.items[1].price === 50, 'The new item should have the correct price from body.');
        check(finalContext.data.cart.total === 150, 'Step "action:run" should have recalculated the total correctly.');

    } finally {
        if (appPath) await cleanupTestApp(appPath);
    }
}


// --- Главная функция запуска ---

async function main() {
    console.log('--- Running ActionEngine Tests ---');
    await runSetStepTest();
    await runIfThenElseStepTest();
    await runRunStepTest();
    await runActionRunStepTest();
    console.log('\n🏆 All ActionEngine tests passed successfully!');
}

main().catch(err => {
    console.error(`\n🔥 A fatal error occurred during ActionEngine tests:`, err);
    process.exit(1);
});