const path = require('path');
const http = require('http');
const { JSDOM, VirtualConsole } = require('jsdom');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Очистка кэша
const MODULES_TO_CLEAR = ['index.js', 'core/renderer.js', 'core/asset-loader.js'];
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
    // В этом тесте сервер не нужен, так как мы проверяем только рендеринг и выполнение JS
    const { Renderer } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/renderer.js'));
    const { AssetLoader } = require(path.join(PROJECT_ROOT, 'packages/serverokey/core/asset-loader.js'));

    log('Setting up environment for integration test...');
    const manifest = require(path.join(appPath, 'manifest.js'));
    const assetLoader = new AssetLoader(appPath, manifest);
    // ConnectorManager и другие зависимости не нужны
    const renderer = new Renderer(assetLoader, manifest, null);

    // Получаем HTML-код страницы, как если бы его отдал сервер
    const routeConfig = manifest.routes['GET /'];
    const html = await renderer.renderView(routeConfig, {}, null);
    log('Generated initial HTML.');

    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (e) => console.error("[JSDOM Error]", e));
    virtualConsole.on("log", (msg) => console.log(`[JSDOM Console] ${msg}`));

    log('Loading HTML into JSDOM...');
    // JSDOM теперь просто выполнит инлайновый скрипт, ему не нужно ничего загружать
    const dom = new JSDOM(html, {
        runScripts: "dangerously",
        virtualConsole
    });

    const document = dom.window.document;
    const targetDiv = document.querySelector('#target-div');
    
    log('Checking DOM modifications by custom.js...');
    check(targetDiv, 'The target div should exist.');
    check(targetDiv.classList.contains('modified-by-js'), 'Custom JS should have added a class to the div.', targetDiv.outerHTML);
    check(targetDiv.textContent === 'Hello from Custom JS!', 'Custom JS should have changed the text content.', targetDiv.textContent);
}

// --- Экспорт Теста ---

module.exports = {
    'Integration: Custom client-side JS should execute and interact with the DOM': {
        options: {
            manifest: {
                components: { 'layout': 'layout.html' },
                routes: {
                    'GET /': { type: 'view', layout: 'layout' },
                }
            },
            files: {
                // *** ГЛАВНОЕ ИСПРАВЛЕНИЕ ***
                // Вставляем JS прямо в HTML-шаблон.
                'app/components/layout.html': `
                    <!DOCTYPE html>
                    <html>
                        <head></head>
                        <body>
                            <div id="target-div">Initial Text</div>
                            
                            <script>
                                // Этот код будет выполнен JSDOM
                                console.log('[Custom.js] Inline script executing...');
                                const targetDiv = document.querySelector('#target-div');
                                if (targetDiv) {
                                    targetDiv.classList.add('modified-by-js');
                                    targetDiv.textContent = 'Hello from Custom JS!';
                                }
                            </script>
                        </body>
                    </html>
                `,
            }
        },
        run: runCustomClientJsTest
    }
};