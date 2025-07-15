const path = require('path');
const http = require('http');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очистка кэша
const MODULES_TO_CLEAR = [
    'index.js', 'core/request-handler.js', 'core/asset-loader.js',
    'core/connector-manager.js'
];
MODULES_TO_CLEAR.forEach(file => {
    const modulePath = path.join(PROJECT_ROOT, 'packages/serverokey', file);
    if (require.cache[modulePath]) delete require.cache[modulePath];
});

// Вспомогательные функции
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

function check(condition, description, actual) {
    if (condition) {
        console.log(`  ✅ OK: ${description}`);
    } else {
        console.error(`  ❌ FAILED: ${description}`);
        if (actual !== undefined) console.error('     ACTUAL VALUE:', actual);
        throw new Error(`Assertion failed: ${description}`);
    }
}

function createMockHttp(method, url, headers = {}) {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost', ...headers };

    const res = new http.ServerResponse(req);
    const chunks = [];
    const originalEnd = res.end;
    res.end = (chunk) => {
        if (chunk) chunks.push(Buffer.from(chunk));
        originalEnd.call(res);
        res.emit('finish');
    };

    const resultPromise = new Promise((resolve) => {
        res.on('finish', () => {
            resolve({
                statusCode: res.statusCode,
                headers: res.getHeaders(),
                body: Buffer.concat(chunks).toString('utf8')
            });
        });
    });
    
    return { req, res, resultPromise };
}

// --- Тестовые Сценарии ---

async function runRequestHandlerTests(appPath) {
    // *** ИСПРАВЛЕНИЕ ЗДЕСЬ ***
    const REQUEST_HANDLER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/request-handler.js');
    const { RequestHandler } = require(REQUEST_HANDLER_PATH);
    const { ConnectorManager } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/connector-manager.js'));
    const { AssetLoader } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/asset-loader.js'));

    log('Setting up environment for RequestHandler tests...');
    const manifest = require(path.join(appPath, 'manifest.js'));
    const connectorManager = new ConnectorManager(appPath, manifest);
    const assetLoader = new AssetLoader(appPath, manifest);
    const requestHandler = new RequestHandler(manifest, connectorManager, assetLoader, null, appPath);
    log('Environment setup complete.');

    // --- Сценарий 1: 404 Not Found ---
    log('--- Test Case: 404 Not Found ---');
    let { req, res, resultPromise } = createMockHttp('GET', '/nonexistent-page');
    await requestHandler.handle(req, res);
    let response = await resultPromise;
    log('Response for nonexistent route:', response);
    check(response.statusCode === 404, 'Should return 404 for a route that does not exist.');

    // --- Сценарий 2: Неправильный метод (тоже 404) ---
    log('--- Test Case: Wrong Method (expecting 404) ---');
    ({ req, res, resultPromise } = createMockHttp('POST', '/'));
    await requestHandler.handle(req, res);
    response = await resultPromise;
    log('Response for wrong method:', response);
    check(response.statusCode === 404, 'Should return 404 for an existing route with wrong method.');

    // --- Сценарий 3: Невалидный JSON в теле POST-запроса ---
    log('--- Test Case: Invalid JSON in POST body ---');
    ({ req, res, resultPromise } = createMockHttp('POST', '/action/doSomething', { 'content-type': 'application/json' }));
    await requestHandler.handle(req, res); // Вызываем handle до эмита событий
    const invalidJson = '{ "key": "value", }';
    req.emit('data', invalidJson);
    req.emit('end');
    response = await resultPromise;
    log('Response for invalid JSON:', response);
    check(response.statusCode === 500, 'Should return 500 for invalid JSON in body.'); 
    
    // --- Сценарий 4: Доступ к внутреннему роуту ---
    log('--- Test Case: Accessing internal route ---');
    ({ req, res, resultPromise } = createMockHttp('GET', '/internalAction'));
    await requestHandler.handle(req, res);
    response = await resultPromise;
    log('Response for internal route:', response);
    check(response.statusCode === 403, 'Should return 403 Forbidden for internal routes.');
}

// --- Экспорт Теста ---

module.exports = {
    'RequestHandler: Should correctly handle various error scenarios': {
        options: {
            manifest: {
                routes: {
                    'GET /': { type: 'view', layout: 'main' },
                    'POST /action/doSomething': { type: 'action', steps: [] },
                    'internalAction': { type: 'action', internal: true, steps: [] }
                },
                components: { 'main': 'main.html' }
            },
            files: {
                'app/components/main.html': '<div></div>'
            }
        },
        run: runRequestHandlerTests
    }
};