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

    try {
        log('Starting server for integration test...');
        
        // Правильно получаем экземпляр сервера из возвращаемого объекта
        const serverComponents = createServer(appPath);
        server = serverComponents.server;

        await new Promise(resolve => server.listen(PORT, resolve));
        log(`Server listening on port ${PORT}`);

        log('Fetching the main page...');
        const pageUrl = `http://localhost:${PORT}/`;
        const html = await fetch(pageUrl).then(res => res.text());
        log('Received initial HTML.');

        const virtualConsole = new VirtualConsole();
        virtualConsole.on("error", (error) => console.error("[JSDOM Error]", error.stack || error.message));
        virtualConsole.on("jsdomError", (error) => console.error("[JSDOM Internal Error]", error.stack || error.message));

        log('Loading HTML into JSDOM to simulate a browser...');
        const dom = new JSDOM(html, {
            url: pageUrl,
            runScripts: "dangerously",
            resources: "usable",
            virtualConsole 
        });

        await new Promise(resolve => {
            dom.window.addEventListener('load', resolve);
        });
        log('JSDOM window "load" event fired.');

        const document = dom.window.document;
        const targetDiv = document.querySelector('#target-div');
        
        log('Checking DOM modifications by custom.js...');
        check(targetDiv, 'The target div should exist.');
        check(targetDiv.classList.contains('modified-by-js'), 'Custom JS should have added a class to the div.', targetDiv.outerHTML);
        check(targetDiv.textContent === 'Hello from Custom JS!', 'Custom JS should have changed the text content.', targetDiv.textContent);
        
    } finally {
        log('Cleaning up: closing server...');
        if (server) await new Promise(resolve => server.close(resolve));
        log('Cleanup complete.');
    }
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
                    'GET /engine-client.js': {
                         handler: (req, res) => {
                            const fs = require('fs');
                            const scriptPath = path.join(PROJECT_ROOT, 'packages/serverokey/engine-client.js');
                            res.writeHead(200, {'Content-Type': 'application/javascript'});
                            res.end(fs.readFileSync(scriptPath));
                         }
                    }
                }
            },
            files: {
                'app/components/layout.html': `
                    <!DOCTYPE html>
                    <html>
                        <head></head>
                        <body>
                            <div id="target-div">Initial Text</div>
                            <script src="/custom.js"></script>
                            <script src="/engine-client.js"></script>
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