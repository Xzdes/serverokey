const path = require('path');
const http = require('http');
const { JSDOM, VirtualConsole } = require('jsdom');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очистка кэша
const MODULES_TO_CLEAR = ['index.js', 'core/renderer.js', 'core/asset-loader.js', 'core/request-handler.js'];
MODULES_TO_CLEAR.forEach(file => {
    const modulePath = path.join(PROJECT_ROOT, 'packages/serverokey', file);
    if (require.cache[modulePath]) delete require.cache[modulePath];
});

// Вспомогательные функции
function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
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

async function runCustomClientJsTest(appPath) {
    const { createServer } = require(path.join(PROJECT_ROOT, 'packages/serverokey/index.js'));
    let server;
    const PORT = 3002;

    // Добавляем таймаут для всего теста
    const testTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timed out after 5 seconds')), 5000)
    );

    const testLogic = new Promise(async (resolve, reject) => {
        try {
            log('Starting server for integration test...');
            const serverComponents = createServer(appPath);
            server = serverComponents.server;
            await new Promise(resolve => server.listen(PORT, resolve));
            log(`Server listening on port ${PORT}`);

            log('Fetching the main page using http.get...');
            const pageUrl = `http://localhost:${PORT}/`;
            const html = await new Promise((resolve, reject) => {
                http.get(pageUrl, res => {
                    let rawData = '';
                    res.on('data', chunk => rawData += chunk);
                    res.on('end', () => resolve(rawData));
                }).on('error', reject);
            });
            log('Received initial HTML.');

            const virtualConsole = new VirtualConsole();
            virtualConsole.on("jsdomError", (e) => console.error("[JSDOM Error]", e));
            virtualConsole.on("error", (e) => console.error("[Console Error]", e));

            log('Loading HTML into JSDOM...');
            const dom = new JSDOM(html, { url: pageUrl, runScripts: "dangerously", resources: "usable", virtualConsole });

            await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
            log('JSDOM window "load" event fired.');

            const document = dom.window.document;
            const targetDiv = document.querySelector('#target-div');
            
            log('Checking DOM modifications by custom.js...');
            check(targetDiv, 'The target div should exist.');
            check(targetDiv.classList.contains('modified-by-js'), 'Custom JS should have added a class.', targetDiv.outerHTML);
            check(targetDiv.textContent === 'Hello from Custom JS!', 'Custom JS should have changed the text.', targetDiv.textContent);
            
            resolve(); // Успешное завершение логики теста
        } catch (error) {
            reject(error); // Передаем ошибку
        } finally {
            log('Cleaning up: closing server...');
            if (server) await new Promise(resolve => server.close(resolve));
            log('Cleanup complete.');
        }
    });

    // Запускаем логику теста и таймаут параллельно. Кто первый - тот и победил.
    await Promise.race([testLogic, testTimeout]);
}

// --- Экспорт Теста ---

module.exports = {
    'Integration: Custom client-side JS should execute and interact with the DOM': {
        options: {
            manifest: {
                components: { 'layout': 'layout.html' },
                routes: {
                    'GET /': { type: 'view', layout: 'layout' },
                    'GET /custom.js': {
                        handler: (req, res) => {
                            const fs = require('fs');
                            const scriptPath = path.join(req.appPath, 'public', 'custom.js');
                            res.writeHead(200, {'Content-Type': 'application/javascript'});
                            res.end(fs.readFileSync(scriptPath));
                        }
                    },
                }
            },
            files: {
                'app/components/layout.html': `
                    <!DOCTYPE html>
                    <html>
                        <head></head>
                        <body>
                            <div id="target-div">Initial Text</div>
                            <!-- Убираем engine-client.js, чтобы не усложнять тест -->
                            <script src="/custom.js"></script>
                        </body>
                    </html>
                `,
                'public/custom.js': `
                    console.log('[Custom.js] Script executing...');
                    const targetDiv = document.querySelector('#target-div');
                    if (targetDiv) {
                        targetDiv.classList.add('modified-by-js');
                        targetDiv.textContent = 'Hello from Custom JS!';
                    }
                `
            }
        },
        run: runCustomClientJsTest
    }
};