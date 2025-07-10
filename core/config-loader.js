// core/config-loader.js
// Отвечает только за загрузку манифеста.
const path = require('path');

function loadManifest(appPath) {
    const manifestPath = path.join(appPath, 'manifest.js');
    try {
        return require(manifestPath);
    } catch (e) {
        console.error(`[Engine] CRITICAL: Could not load manifest from ${manifestPath}`);
        throw e;
    }
}

module.exports = { loadManifest };