const path = require('path');
const fs = require('fs/promises');

const C_RESET = '\x1b[0m';
const C_RED = '\x1b[31m';
const C_GREEN = '\x1b[32m';
const C_YELLOW = '\x1b[33m';

function assert(condition, message) {
    if (condition) {
        console.log(`  ${C_GREEN}✓${C_RESET} ${message}`);
    } else {
        console.error(`\n  ${C_RED}✗ FAILED: ${message}${C_RESET}\n`);
        process.exit(1);
    }
}

async function createTestApp(testName, options = {}) {
    const { manifest = {}, files = {} } = options;
    const tempAppPath = path.resolve(__dirname, '..', '_temp', testName);
    const manifestPath = path.join(tempAppPath, 'manifest.js');

    await fs.rm(tempAppPath, { recursive: true, force: true });

    for (const relativePath in files) {
        const fullPath = path.join(tempAppPath, relativePath);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, files[relativePath], 'utf-8');
    }

    const manifestContent = `module.exports = ${JSON.stringify(manifest, null, 2)};`;
    await fs.writeFile(manifestPath, manifestContent, 'utf-8');
    
    await fs.writeFile(path.join(tempAppPath, 'package.json'), '{ "name": "test-app" }');

    return { appPath: tempAppPath, manifestPath };
}

async function cleanupTestApp(appPath) {
    if (!appPath) return;
    const manifestPath = path.join(appPath, 'manifest.js');
    if (require.cache[manifestPath]) {
        delete require.cache[manifestPath];
    }
    try {
        await fs.rm(appPath, { recursive: true, force: true });
    } catch (error) {
        console.warn(`${C_YELLOW}Warning: Could not fully clean up test app at ${appPath}${C_RESET}`, error);
    }
}

module.exports = {
    assert,
    createTestApp,
    cleanupTestApp,
};