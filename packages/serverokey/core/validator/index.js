// core/validator/index.js
const validateComponents = require('./check-components');
const validateConnectors = require('./check-connectors');
const validateRoutes = require('./check-routes');
const { getIssues, clearIssues, addIssue } = require('./utils');

/**
 * Проверяет секцию globals.
 * @param {object} manifest 
 */
function validateGlobals(manifest) {
    if (!manifest.globals) return;
    
    const connectorNames = Object.keys(manifest.connectors || {});
    const category = 'Globals';

    if (manifest.globals.injectData && Array.isArray(manifest.globals.injectData)) {
        manifest.globals.injectData.forEach(name => {
            if (!connectorNames.includes(name)) {
                addIssue('error', category, `Injected connector '${name}' is not defined in 'manifest.connectors'.`);
            }
        });
    }
}

/**
 * Основная функция, которая запускает все проверки манифеста.
 * @param {object} manifest - Объект манифеста.
 * @param {string} appPath - Абсолютный путь к приложению.
 * @returns {Array<object>} - Массив всех найденных проблем.
 */
function validateManifest(manifest, appPath) {
  clearIssues();

  if (!manifest) {
    addIssue('critical', 'Manifest', 'manifest.js file could not be loaded or is empty.');
    return getIssues();
  }

  // --- Проверка наличия корневых секций ---
  const requiredSections = ['connectors', 'components', 'routes'];
  requiredSections.forEach(section => {
    if (!manifest[section]) {
      const suggestion = Object.keys(manifest).find(key => key.toLowerCase() === section) 
          ? `Did you mean '${Object.keys(manifest).find(key => key.toLowerCase() === section)}'?` 
          : '';
      addIssue('error', 'Manifest Structure', `Required top-level section '${section}' is missing.`, suggestion);
    }
  });

  // Если нет ключевых секций, дальнейшие проверки могут быть бессмысленны
  if (getIssues().some(i => i.level === 'error')) {
      return getIssues();
  }

  // Запускаем все остальные модули проверок
  validateGlobals(manifest);
  validateConnectors(manifest);
  validateComponents(manifest, appPath);
  validateRoutes(manifest, appPath);

  return getIssues();
}

module.exports = validateManifest;