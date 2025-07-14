const path = require('path');
const fs = require('fs/promises');

async function createTestAppStructure(testName, options = {}) {
    const { manifest = {}, files = {} } = options;
    const tempAppPath = path.resolve(__dirname, '..', '_temp', testName);
    const manifestPath = path.join(tempAppPath, 'manifest.js');

    await fs.rm(tempAppPath, { recursive: true, force: true });
    await fs.mkdir(tempAppPath, { recursive: true });

    // *** ИСПРАВЛЕНИЕ: Всегда создаем manifest.js ***
    const manifestContent = `module.exports = ${JSON.stringify(manifest, null, 2)};`;
    await fs.writeFile(manifestPath, manifestContent, 'utf-8');

    for (const relativePath in files) {
        const fullPath = path.join(tempAppPath, relativePath);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, files[relativePath], 'utf-8');
    }
    
    await fs.writeFile(path.join(tempAppPath, 'package.json'), '{ "name": "test-app" }');

    return tempAppPath;
}

// ... остальной код без изменений
async function cleanupTestApp(appPath) {
    if (!appPath) return;
    try {
        await fs.rm(appPath, { recursive: true, force: true });
    } catch (error) {
    }
}

module.exports = {
    createTestAppStructure,
    cleanupTestApp,
};