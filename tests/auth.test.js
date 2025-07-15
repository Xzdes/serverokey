const path = require('path');
const http = require('http'); // Понадобится для создания моков req/res

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очистка кэша для всех используемых модулей ядра
const REQUEST_HANDLER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/request-handler.js');
if (require.cache[REQUEST_HANDLER_PATH]) delete require.cache[REQUEST_HANDLER_PATH];
// ... и для всех остальных зависимостей, чтобы обеспечить чистоту
['action-engine.js', 'asset-loader.js', 'auth-engine.js', 'connector-manager.js', 'connectors/wise-json-connector.js'].forEach(file => {
    const modulePath = path.join(PROJECT_ROOT, 'packages/serverokey/core', file);
    if (require.cache[modulePath]) delete require.cache[modulePath];
});


// Вспомогательные функции
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) {
        console.log(JSON.stringify(data, null, 2));
    }
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

/**
 * Инициализирует полное окружение для теста, включая RequestHandler.
 */
function setupAuthEnvironment(appPath) {
    log('Setting up environment for Auth test...');
    const { RequestHandler } = require(REQUEST_HANDLER_PATH);
    const { ConnectorManager } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/connector-manager.js'));
    const { AssetLoader } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/asset-loader.js'));

    const manifest = require(path.join(appPath, 'manifest.js'));
    const connectorManager = new ConnectorManager(appPath, manifest);
    // Для тестов аутентификации нам не нужен Renderer
    const assetLoader = new AssetLoader(appPath, manifest);
    const requestHandler = new RequestHandler(manifest, connectorManager, assetLoader, null, appPath);
    
    // Дадим Wise.JSON время на инициализацию
    return new Promise(resolve => setTimeout(() => {
        log('Environment setup complete.');
        resolve({ requestHandler, connectorManager });
    }, 100));
}

/**
 * Создает мок-объекты запроса и ответа для тестирования RequestHandler.
 */
function createMockHttp(method, url, headers = {}, body = '') {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = url;
    req.headers = {
        'host': 'localhost:3000',
        ...headers
    };

    const res = new http.ServerResponse(req);
    const chunks = [];
    let endCalled = false;
    const originalEnd = res.end;
    res.end = (chunk) => {
        if (chunk) chunks.push(chunk);
        endCalled = true;
        originalEnd.call(res, chunk);
    };

    // Обертка для получения результата
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

async function runAuthWorkflowTest(appPath) {
    const { requestHandler, connectorManager } = await setupAuthEnvironment(appPath);

    // --- 1. Регистрация ---
    log('--- Stage 1: Registration ---');
    let { req, res, resultPromise } = createMockHttp(
        'POST', '/auth/register', 
        { 'content-type': 'application/json' },
        JSON.stringify({ name: 'Test User', login: 'testuser', password: 'password123' })
    );
    requestHandler.handle(req, res);
    req.emit('data', JSON.stringify({ name: 'Test User', login: 'testuser', password: 'password123' }));
    req.emit('end');
    let response = await resultPromise;
    log('Registration response:', response);
    check(response.statusCode === 302, 'Successful registration should result in a redirect (302).');
    check(response.headers.location === '/login?registered=true', 'Should redirect to login page with success flag.');

    // Проверяем, что пользователь создан в БД
    const userConnector = connectorManager.getConnector('user').collection;
    const user = await userConnector.findOne({ login: 'testuser' });
    log('User in DB after registration:', user);
    check(user, 'User should be created in the database.');
    check(user.name === 'Test User', 'User should have the correct name.');
    const bcrypt = require('bcrypt');
    const passwordMatch = await bcrypt.compare('password123', user.passwordHash);
    check(passwordMatch, 'Password should be correctly hashed and stored.');


    // --- 2. Логин ---
    log('--- Stage 2: Login ---');
    ({ req, res, resultPromise } = createMockHttp(
        'POST', '/auth/login', 
        { 'content-type': 'application/json' },
        JSON.stringify({ login: 'testuser', password: 'password123' })
    ));
    requestHandler.handle(req, res);
    req.emit('data', JSON.stringify({ login: 'testuser', password: 'password122' })); // Сначала с неверным паролем
    req.emit('end');
    response = await resultPromise;
    check(response.headers.location === '/login?error=1', 'Login with wrong password should redirect with error.');
    
    // Теперь с верным паролем
    ({ req, res, resultPromise } = createMockHttp(
        'POST', '/auth/login', 
        { 'content-type': 'application/json' },
        JSON.stringify({ login: 'testuser', password: 'password123' })
    ));
    requestHandler.handle(req, res);
    req.emit('data', JSON.stringify({ login: 'testuser', password: 'password123' }));
    req.emit('end');
    response = await resultPromise;
    log('Login response:', response);
    check(response.statusCode === 302, 'Successful login should result in a redirect (302).');
    check(response.headers.location === '/', 'Should redirect to the main page.');
    const sessionCookie = response.headers['set-cookie'][0];
    check(sessionCookie.includes('session_id'), 'A session_id cookie should be set on login.');


    // --- 3. Доступ к защищенному роуту ---
    log('--- Stage 3: Accessing protected route ---');
    // Сначала без куки
    ({ req, res, resultPromise } = createMockHttp('GET', '/protected'));
    requestHandler.handle(req, res);
    req.emit('end');
    response = await resultPromise;
    check(response.headers.location === '/login', 'Accessing protected route without session should redirect to login.');

    // Теперь с куки
    ({ req, res, resultPromise } = createMockHttp('GET', '/protected', { cookie: sessionCookie }));
    requestHandler.handle(req, res);
    req.emit('end');
    response = await resultPromise;
    check(response.statusCode === 200, 'Accessing protected route with session should be successful (200).');
    check(response.body === 'Protected Content', 'Protected route should return its content.');


    // --- 4. Выход ---
    log('--- Stage 4: Logout ---');
    ({ req, res, resultPromise } = createMockHttp('GET', '/auth/logout', { cookie: sessionCookie }));
    requestHandler.handle(req, res);
    req.emit('end');
    response = await resultPromise;
    log('Logout response:', response);
    const expiredCookie = response.headers['set-cookie'][0];
    check(response.headers.location === '/login', 'Logout should redirect to login page.');
    check(expiredCookie.includes('max-age=-1'), 'Logout should set an expired cookie.');
}


// --- Экспорт Тестов ---

module.exports = {
    'Authentication: Full user workflow (register, login, access, logout)': {
        options: {
            manifest: {
                auth: {
                    userConnector: 'user',
                    identityField: 'login',
                    passwordField: 'passwordHash'
                },
                connectors: {
                    user: { type: 'wise-json', collection: 'auth_test_users' },
                    session: { type: 'wise-json', collection: 'auth_test_sessions' }
                },
                routes: {
                    // Используем роуты, аналогичные тем, что в документации
                    'POST /auth/register': {
                        type: 'action', reads: ['user'], writes: ['user'],
                        steps: [
                            { "set": "context.userExists", "to": "data.user.items.some(u => u.login === body.login)" },
                            { "if": "context.userExists",
                              "then": [{ "client:redirect": "'/register?error=1'" }],
                              "else": [
                                { "set": "context.bcrypt", "to": "require('bcrypt')" },
                                { "set": "context.passwordHash", "to": "context.bcrypt.hashSync(body.password, 10)" },
                                { "set": "context.newUser", "to": "{ login: body.login, name: body.name, passwordHash: context.passwordHash }" },
                                { "set": "data.user.items", "to": "data.user.items.concat([context.newUser])" },
                                { "client:redirect": "'/login?registered=true'" }
                              ]
                            }
                        ]
                    },
                    'POST /auth/login': {
                        type: 'action', reads: ['user'],
                        steps: [
                            { "set": "context.user", "to": "data.user.items.find(u => u.login === body.login)" },
                            { "if": "context.user && require('bcrypt').compareSync(body.password, context.user.passwordHash)",
                              "then": [
                                { "auth:login": "context.user" },
                                { "client:redirect": "'/'" }
                              ],
                              "else": [{ "client:redirect": "'/login?error=1'" }]
                            }
                        ]
                    },
                    'GET /protected': {
                        type: 'action', // Для простоты сделаем action, а не view
                        auth: { required: true, failureRedirect: '/login' },
                        steps: [],
                        // Этот роут просто вернет 200 ОК, если аутентификация прошла
                        handler: (req, res) => res.end('Protected Content')
                    },
                    'GET /auth/logout': {
                        type: 'action',
                        auth: { required: true },
                        steps: [
                            { "auth:logout": true },
                            { "client:redirect": "'/login'" }
                        ]
                    }
                }
            }
        },
        run: runAuthWorkflowTest
    }
};