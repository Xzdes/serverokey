// core/validator/utils.js
const fs = require('fs');
const path = require('path');

// Хранилище всех найденных проблем
const issues = [];

/**
 * Добавляет новую проблему (ошибку или предупреждение) в общий список.
 * @param {'error' | 'warning'} level - Уровень проблемы.
 * @param {string} category - Категория (напр. "Route 'GET /'").
 * @param {string} message - Основное сообщение.
 * @param {string} [suggestion=''] - Необязательное предложение по исправлению.
 */
function addIssue(level, category, message, suggestion = '') {
  issues.push({ level, category, message, suggestion });
}

/**
 * Проверяет существование файла и добавляет ошибку, если его нет.
 * @param {string} filePath - Абсолютный путь к файлу.
 * @param {string} category - Категория для сообщения об ошибке.
 * @param {string} description - Описание того, что это за файл (напр. "template for component 'main'").
 * @returns {boolean} - true, если файл существует.
 */
function checkFileExists(filePath, category, description) {
  if (!fs.existsSync(filePath)) {
    addIssue('error', category, `File not found for ${description}:`, `  Path: ${filePath}`);
    return false;
  }
  return true;
}

/**
 * Очищает список проблем перед новым запуском валидации.
 */
function clearIssues() {
  issues.length = 0;
}

/**
 * Возвращает все собранные проблемы.
 * @returns {Array<object>}
 */
function getIssues() {
  return [...issues];
}

module.exports = {
  addIssue,
  checkFileExists,
  clearIssues,
  getIssues,
};