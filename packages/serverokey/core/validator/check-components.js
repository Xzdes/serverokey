// core/validator/check-components.js
const path = require('path');
const { addIssue, checkFileExists } = require('./utils');

function validateComponents(manifest, appPath) {
  const components = manifest.components || {};

  for (const name in components) {
    const config = components[name];
    const category = `Component '${name}'`;

    let templatePath;

    if (typeof config === 'string') {
      templatePath = config;
    } else if (typeof config === 'object' && config.template) {
      templatePath = config.template;
      if (config.style) {
        checkFileExists(path.join(appPath, 'app', 'components', config.style), category, `style file`);
      }
    } else {
      addIssue('error', category, `Invalid component definition. Must be a string (template path) or an object with a 'template' property.`);
      continue;
    }

    checkFileExists(path.join(appPath, 'app', 'components', templatePath), category, `template file`);
  }
}

module.exports = validateComponents;