// packages/kassa-app-example/manifest.js

// --- Шаг 1: Импортируем все модульные части конфигурации ---

// Подключаем конфигурацию коннекторов (источников данных)
const connectors = require('./manifest/connectors.js');
// Подключаем регистрацию всех UI-компонентов
const components = require('./manifest/components.js');
// Подключаем все роуты и бизнес-логику
const routes = require('./manifest/routes.js');

// --- Шаг 2: Собираем и экспортируем финальный объект манифеста ---

module.exports = {
  // Глобальные переменные, доступные во всех шаблонах
  globals: {
    appName: "Атомарная Касса",
    appVersion: "3.0.0-native", // Обновим версию для наглядности
  },
  
  // Конфигурация WebSocket для real-time обновлений
  sockets: {
    "receipt-updates": {
      "watch": "receipt", // Следить за изменениями в коннекторе 'receipt'
      "emit": {
        "event": "receipt-changed", // Имя события, отправляемого на клиент
        "payload": "receipt"        // Отправлять полное состояние коннектора 'receipt'
      }
    }
  },

  // Основные настройки системы аутентификации
  auth: {
    userConnector: 'user', 
    identityField: 'login',
    passwordField: 'passwordHash'
  },
  
  // --- НОВАЯ СЕКЦИЯ: Конфигурация запуска ---
  launch: {
    // Указываем, что хотим запуститься в нативном режиме native, в режиме сервера server
    mode: 'server', 
    
    // Настройки для окна Chromium
    window: {
      title: "Атомарная Касса v3",
      width: 1280,
      height: 820,
      devtools: true // Открывать ли инструменты разработчика при старте
    }
  },

  // --- Шаг 3: Подключаем импортированные модули ---
  
  connectors: connectors,
  components: components,
  routes: routes
};