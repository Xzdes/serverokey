// tests/renderer.test.js

const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');

const RENDERER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/renderer.js');
if (require.cache[RENDERER_PATH]) {
    delete require.cache[RENDERER_PATH];
}
const ASSET_LOADER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/asset-loader.js');
if (require.cache[ASSET_LOADER_PATH]) {
    delete require.cache[ASSET_LOADER_PATH];
}
const CONNECTOR_MANAGER_PATH = path.join(PROJECT_ROOT, 'packages/serverokey/core/connector-manager.js');
if (require.cache[CONNECTOR_MANAGER_PATH]) {
    delete require.cache[CONNECTOR_MANAGER_PATH];
}


function log(message, data) {
    console.log(`\n[LOG] ${message}`);
    if (data !== undefined) {
        console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
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

function setupEnvironment(appPath) {
    log('Setting up test environment...');
    const { Renderer } = require(RENDERER_PATH);
    const { AssetLoader } = require(ASSET_LOADER_PATH);
    const { ConnectorManager } = require(CONNECTOR_MANAGER_PATH);
    const manifest = require(path.join(appPath, 'manifest.js'));
    const connectorManager = new ConnectorManager(appPath, manifest);
    const assetLoader = new AssetLoader(appPath, manifest);
    const renderer = new Renderer(assetLoader, manifest, connectorManager, null, { debug: true });
    log('Environment setup complete.');
    return { manifest, renderer };
}


async function runBasicRenderingTest(appPath) {
    const { renderer } = setupEnvironment(appPath);
    const { html } = await renderer.renderComponent('hello', { name: 'World' });
    log('Received HTML:', html);
    check(/<h1[^>]*>Hello, World!<\/h1>/.test(html), 'Rendered HTML should contain "<h1>Hello, World!</h1>"');
}

async function runAtomIfRemovesElementTest(appPath) {
    const { renderer } = setupEnvironment(appPath);
    const { html } = await renderer.renderComponent('conditional', { show: false });
    log('Received HTML:', html);
    check(!html.includes('You should not see this'), 'Element with false atom-if condition should be removed.', html);
}

async function runAtomIfKeepsElementTest(appPath) {
    const { renderer } = setupEnvironment(appPath);
    const { html } = await renderer.renderComponent('conditional', { user: { isAdmin: true } });
    log('Received HTML:', html);
    check(html.includes('Welcome, Admin!'), 'Element with true atom-if condition should be kept.', html);
    check(!html.includes('atom-if'), 'The atom-if attribute itself should be removed.', html);
}

async function runScopedCssTest(appPath) {
    const { renderer } = setupEnvironment(appPath);
    const { html, styles } = await renderer.renderComponent('card', {});
    log('Received HTML:', html);
    log('Received Styles:', styles);
    const componentIdMatch = html.match(/data-component-id="([^"]+)"/);
    check(componentIdMatch, 'HTML should have a data-component-id attribute.');
    const scopeSelector = `[data-component-id="${componentIdMatch[1]}"]`;
    check(styles.includes(`${scopeSelector} h3`), 'CSS rule for h3 should be scoped.', styles);
}

async function runViewRenderingTest(appPath) {
    const { manifest, renderer } = setupEnvironment(appPath);
    const finalHtml = await renderer.renderView(manifest.routes['GET /'], {}, null);
    log('Received final page HTML (first 200 chars):', finalHtml.substring(0, 200) + '...');
    
    check(
        /<header[^>]*>Header<\/header>/.test(finalHtml), 
        'Header component should be injected.',
        finalHtml
    );
    
    // ИСПРАВЛЕННАЯ ПРОВЕРКА: Используем регулярное выражение
    check(
        /<style[^>]*data-component-name="header"/.test(finalHtml), 
        'Style tag should be added to head.',
        finalHtml
    );
}


module.exports = {
    'Renderer: Basic variable rendering': {
        options: {
            manifest: { components: { 'hello': 'hello.html' } },
            files: { 'app/components/hello.html': '<h1>Hello, {{name}}!</h1>' }
        },
        run: runBasicRenderingTest
    },
    'Renderer: atom-if with false condition should remove element': {
        options: {
            manifest: { components: { 'conditional': 'conditional.html' } },
            files: { 'app/components/conditional.html': '<div><p atom-if="show">You should not see this.</p></div>' }
        },
        run: runAtomIfRemovesElementTest
    },
    'Renderer: atom-if with true condition should keep element': {
        options: {
            manifest: { components: { 'conditional': 'conditional.html' } },
            files: { 'app/components/conditional.html': '<div><p atom-if="user.isAdmin">Welcome, Admin!</p></div>' }
        },
        run: runAtomIfKeepsElementTest
    },
    'Renderer: Scoped CSS should be applied': {
        options: {
            manifest: { components: { 'card': { template: 'card.html', style: 'card.css' } } },
            files: {
                'app/components/card.html': '<div><h3>Title</h3></div>',
                'app/components/card.css': 'h3 { color: red; }'
            }
        },
        run: runScopedCssTest
    },
    'Renderer: View rendering should inject components and styles': {
        options: {
            manifest: {
                components: {
                    'layout': 'layout.html',
                    'header': { template: 'header.html', style: 'header.css' },
                },
                routes: { 'GET /': { type: 'view', layout: 'layout', inject: { 'header': 'header' } } }
            },
            files: {
                'app/components/layout.html': '<html><head></head><body><atom-inject into="header"></atom-inject></body></html>',
                'app/components/header.html': '<header>Header</header>',
                'app/components/header.css': 'h1 { font-size: 24px; }',
            }
        },
        run: runViewRenderingTest
    }
};