// tests/auth.test.js
const path = require('path');
const http = require('http'); 
const { Readable } = require('stream'); // Импортируем Readable

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очистка кэша
['request-handler.js', 'action-engine.js', 'asset-loader.js', 'auth-engine.js', 'connector-manager.js', 'connectors/wise-json-connector.js'].forEach(file => {
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

function setupAuthEnvironment(appPath) {
    log('Setting up environment for Auth test...');
    const { RequestHandler } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/request-handler.js'));
    const { ConnectorManager } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/connector-manager.js'));
    const { AssetLoader } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/asset-loader.js'));

    const manifest = require(path.join(appPath, 'manifest.js'));
    const connectorManager = new ConnectorManager(appPath, manifest);
    const assetLoader = new AssetLoader(appPath, manifest);
    const requestHandler = new RequestHandler(manifest, connectorManager, assetLoader, null, appPath);
    
    return new Promise(resolve => {
        // Дожидаемся полной инициализации AuthEngine
        requestHandler.authInitPromise.then(() => {
            log('Environment setup complete.');
            resolve({ requestHandler, connectorManager });
        });
    });
}

// *** ИСПРАВЛЕННАЯ ФУНКЦИЯ-ПОМОЩНИК ***
function createMockHttp(method, url, headers = {}, body = '') {
    const reqStream = Readable.from(JSON.stringify(body));
    Object.assign(reqStream, {
        method: method,
        url: url,
        headers: { host: 'localhost:3000', 'content-type': 'application/json', ...headers },
        socket: {}
    });
    
    const req = reqStream;
    const res = new http.ServerResponse(req);
    const chunks = [];
    
    const resultPromise = new Promise((resolve) => {
        res.on('finish', () => {
            resolve({
                statusCode: res.statusCode,
                headers: res.getHeaders(),
                body: Buffer.concat(chunks).toString('utf8')
            });
        });
        const originalEnd = res.end;
        res.end = (chunk, encoding, cb) => {
             if(chunk) chunks.push(Buffer.from(chunk, encoding));
             return originalEnd.call(res, chunk, encoding, cb);
        };
    });
    
    return { req, res, resultPromise };
}


// --- Тестовые Сценарии ---

async function runAuthWorkflowTest(appPath) {
    const { requestHandler, connectorManager } = await setupAuthEnvironment(appPath);

    // --- 1. Регистрация ---
    log('--- Stage 1: Registration ---');
    let { req, res, resultPromise } = createMockHttp(
        'POST', '/auth/register', {},
        { name: 'Test User', login: 'testuser', password: 'password123' }
    );
    await requestHandler.handle(req, res);
    let response = await resultPromise;
    log('Registration response:', response);
    check(JSON.parse(response.body).redirectUrl === '/login?registered=true', 'Should redirect to login page with success flag.');

    // Проверяем, что пользователь создан в БД
    const userDb = connectorManager.getConnector('user').collection;
    const user = await userDb.findOne({ login: 'testuser' });
    log('User in DB after registration:', user);
    check(user, 'User should be created in the database.');
    check(user.name === 'Test User', 'User should have the correct name.');
    const bcrypt = require('bcrypt');
    const passwordMatch = await bcrypt.compare('password123', user.passwordHash);
    check(passwordMatch, 'Password should be correctly hashed and stored.');


    // --- 2. Логин ---
    log('--- Stage 2: Login ---');
    ({ req, res, resultPromise } = createMockHttp(
        'POST', '/auth/login', {},
        { login: 'testuser', password: 'password122' } // Сначала с неверным паролем
    ));
    await requestHandler.handle(req, res);
    response = await resultPromise;
    check(JSON.parse(response.body).redirectUrl === '/login?error=1', 'Login with wrong password should redirect with error.');
    
    // Теперь с верным паролем
    ({ req, res, resultPromise } = createMockHttp(
        'POST', '/auth/login', {},
        { login: 'testuser', password: 'password123' }
    ));
    await requestHandler.handle(req, res);
    response = await resultPromise;
    log('Login response:', response);
    check(JSON.parse(response.body).redirectUrl === '/', 'Should redirect to the main page.');
    const sessionCookie = response.headers['set-cookie'][0];
    check(sessionCookie.includes('session_id'), 'A session_id cookie should be set on login.');


    // --- 3. Доступ к защищенному роуту ---
    log('--- Stage 3: Accessing protected route ---');
    ({ req, res, resultPromise } = createMockHttp('GET', '/protected'));
    await requestHandler.handle(req, res);
    response = await resultPromise;
    check(response.statusCode === 302, 'Accessing protected route without session should redirect to login.');
    check(response.headers.location === '/login', 'Redirect location should be /login.');

    // Теперь с куки
    ({ req, res, resultPromise } = createMockHttp('GET', '/protected', { cookie: sessionCookie }));
    await requestHandler.handle(req, res);
    response = await resultPromise;
    check(response.statusCode === 200, 'Accessing protected route with session should be successful (200).');
    check(response.body === 'Protected Content', 'Protected route should return its content.');


    // --- 4. Выход ---
    log('--- Stage 4: Logout ---');
    ({ req, res, resultPromise } = createMockHttp('GET', '/auth/logout', { cookie: sessionCookie }));
    await requestHandler.handle(req, res);
    response = await resultPromise;
    log('Logout response:', response);
    const expiredCookie = response.headers['set-cookie'][0];
    check(JSON.parse(response.body).redirectUrl === '/login', 'Logout should redirect to login page.');
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
                    user: { type: 'wise-json', collection: 'auth_test_users', initialState: {items: []} },
                    session: { type: 'wise-json', collection: 'auth_test_sessions' }
                },
                routes: {
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
                        type: 'view', // Сделаем view для теста редиректа
                        auth: { required: true, failureRedirect: '/login' },
                        // Для простого теста вернем текст напрямую, а не через рендеринг
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