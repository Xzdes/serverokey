// core/validator/check-connectors.js
const { addIssue } = require('./utils');

function validateConnectors(manifest) {
  const connectors = manifest.connectors || {};

  for (const name in connectors) {
    const config = connectors[name];
    const category = `Connector '${name}'`;

    if (!config.type) {
      addIssue('error', category, `Connector is missing the 'type' property. Must be 'json', 'in-memory', or 'wise-json'.`);
    }

    if (!config.initialState && config.type !== 'wise-json') {
      addIssue('warning', category, `Connector is missing 'initialState'. It's recommended to provide a default state.`);
    }

    if (Array.isArray(config.computed)) {
      const initialState = config.initialState || {};
      config.computed.forEach(rule => {
        // --- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ЗДЕСЬ ---
        // Старая проверка: if (!rule.target || !rule.formula)
        // Новая, более гибкая проверка: правило валидно, если есть target и (formula ИЛИ format)
        if (!rule.target || (!rule.formula && !rule.format)) {
          addIssue('error', category, `Computed rule is invalid. It must have a 'target' property and either a 'formula' or a 'format' property.`, `Invalid rule: ${JSON.stringify(rule)}`);
          return;
        }
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

        // --- УЛУЧШЕННАЯ ПРОВЕРКА (остается без изменений) ---
        if(rule.formula) {
            const sumMatch = rule.formula.match(/sum\(([^,]+),\s*['"]([^'"]+)['"]\)/);
            if (sumMatch) {
              const sourceArrayName = sumMatch[1].trim();
              const fieldToSum = sumMatch[2].trim();
              
              if (!initialState.hasOwnProperty(sourceArrayName)) {
                addIssue('warning', category, `Computed formula "${rule.formula}" uses source array "${sourceArrayName}" which is not defined in initialState.`);
              } else if (Array.isArray(initialState[sourceArrayName]) && initialState[sourceArrayName].length > 0) {
                const sampleItem = initialState[sourceArrayName][0];
                if (typeof sampleItem === 'object' && !sampleItem.hasOwnProperty(fieldToSum)) {
                  addIssue('warning', category, `Computed formula "${rule.formula}" sums by field "${fieldToSum}", but a sample item in initialState.${sourceArrayName} does not have this field.`);
                }
              }
            }
            
            const countMatch = rule.formula.match(/count\(([^)]+)\)/);
            if (countMatch) {
                const sourceArrayName = countMatch[1].trim();
                if (!initialState.hasOwnProperty(sourceArrayName)) {
                    addIssue('warning', category, `Computed formula "${rule.formula}" counts array "${sourceArrayName}" which is not defined in initialState.`);
                }
            }
        }
      });
    }
  }
}

module.exports = validateConnectors;