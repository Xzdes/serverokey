const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очистка кэша для всех используемых модулей ядра
const MODULES_TO_CLEAR = [
    'index.js', 'core/request-handler.js', 'core/socket-engine.js',
    'core/connector-manager.js', 'core/connectors/wise-json-connector.js',
    'core/action-engine.js', 'core/asset-loader.js'
];
MODULES_TO_CLEAR.forEach(file => {
    const modulePath = path.join(PROJECT_ROOT, 'packages/serverokey', file);
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

// --- Тестовый Сценарий ---

async function runSocketEngineTest(appPath) {
    const { createServer } = require(path.join(PROJECT_ROOT, 'packages/serverokey/index.js'));
    let server;
    let ws1, ws2;
    const PORT = 3001;

    try {
        log('Starting a temporary Serverokey server...');
        // Правильно извлекаем экземпляр сервера из объекта
        const serverComponents = createServer(appPath);
        server = serverComponents.server;
        
        await new Promise(resolve => server.listen(PORT, resolve));
        log(`Server is listening on port ${PORT}`);

        const receivedMessages = [];

        const createAndInitializeClient = (url) => {
            return new Promise((resolve, reject) => {
                const ws = new WebSocket(url);
                
                ws.on('message', (message) => {
                    const parsedMessage = JSON.parse(message.toString());
                    log(`Client received message:`, parsedMessage);
                    
                    if (ws.id) {
                        receivedMessages.push({ clientId: ws.id, ...parsedMessage });
                    }

                    if (parsedMessage.type === 'socket_id_assigned') {
                        ws.id = parsedMessage.id;
                        resolve(ws); 
                    }
                });
                
                ws.on('error', reject);
                ws.on('open', () => log(`Client connection opened to ${url}`));
            });
        };

        log('Connecting WebSocket clients and waiting for their IDs...');
        [ws1, ws2] = await Promise.all([
            createAndInitializeClient(`ws://localhost:${PORT}`),
            createAndInitializeClient(`ws://localhost:${PORT}`)
        ]);
        log(`Clients initialized with IDs: ws1=${ws1.id}, ws2=${ws2.id}`);
        
        log(`Subscribing client ws1 (${ws1.id}) to "cart-updates" channel...`);
        ws1.send(JSON.stringify({ type: 'subscribe', channel: 'cart-updates' }));
        await new Promise(resolve => setTimeout(resolve, 50));

        log('Simulating HTTP POST request to trigger an action...');
        const postData = JSON.stringify({ item: 'new item' });
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/action/addItem',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'X-Socket-Id': ws2.id 
            }
        };

        await new Promise((resolve, reject) => {
            const req = http.request(options, res => {
                res.on('data', () => {});
                res.on('end', () => resolve(res.statusCode));
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        log('HTTP request finished. Waiting for broadcasted socket messages...');
        await new Promise(resolve => setTimeout(resolve, 200));

        log('Checking received messages...');
        
        const messagesForWs1 = receivedMessages.filter(m => m.clientId === ws1.id);
        log(`Messages for ws1 (${ws1.id}):`, messagesForWs1);
        
        const cartChangedMessage = messagesForWs1.find(m => m.event === 'cart_updated');
        check(cartChangedMessage, 'Client ws1 (observer) should have received the "cart_updated" event.');
        
        if (cartChangedMessage) {
            const payload = cartChangedMessage.payload;
            check(payload.items.length === 1, 'Payload should contain one item.');
            check(payload.items[0] === 'new item', 'The item in payload should be correct.');
        }

        const messagesForWs2 = receivedMessages.filter(m => m.clientId === ws2.id);
        const cartChangedMessageForInitiator = messagesForWs2.find(m => m.event === 'cart_updated');
        check(!cartChangedMessageForInitiator, 'Client ws2 (initiator) should NOT have received the "cart_updated" event.');

    } finally {
        log('Cleaning up: closing clients and server...');
        if (ws1) ws1.close();
        if (ws2) ws2.close();
        if (server) await new Promise(resolve => server.close(resolve));
        log('Cleanup complete.');
    }
}


// --- Экспорт Теста ---

module.exports = {
    'SocketEngine: Should broadcast changes to clients': {
        options: {
            manifest: {
                sockets: {
                    "cart-updates": {
                      "watch": "cart",
                      "emit": { "event": "cart_updated", "payload": "cart" }
                    }
                },
                connectors: {
                    cart: { type: 'in-memory', initialState: { items: [] } }
                },
                routes: {
                    'POST /action/addItem': {
                        type: 'action',
                        reads: ['cart'],
                        writes: ['cart'],
                        steps: [
                            { "set": "data.cart.items", "to": "data.cart.items.concat([body.item])" }
                        ]
                    }
                }
            }
        },
        run: runSocketEngineTest
    },
};