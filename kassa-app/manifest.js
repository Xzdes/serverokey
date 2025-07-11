// manifest.js

module.exports = {
  data: {
    receipt: { initialState: { items: [], total: '0.00' } },
    positions: { initialState: { all: [] } },
    viewState: { initialState: { query: '', filtered: [] } }
  },
  
  components: {
    mainLayout: 'main-layout.html',
    receipt: {
      template: 'receipt.html',
      style: 'receipt.css'
    },
    positionsList: {
      template: 'positionsList.html',
      style: 'positionsList.css'
    }
  },

  routes: {
    'GET /': {
      type: 'view',
      layout: 'mainLayout',
      inject: {
        'receipt': 'receipt',
        'positionsList': 'positionsList'
      }
    },
    // --- ПЕРЕПИСАННЫЙ ACTION ---
    'POST /action/addItem': {
      type: 'action',
      // handler: 'addItem', // Больше не нужен
      manipulate: {
        target: 'receipt.items',       // Цель: массив items в данных receipt
        operation: 'push',             // Операция: добавить в конец
        source: 'positions.all',       // Источник: массив all в данных positions
        findBy: { "id": "body.id" }    // Найти в source элемент, где id равен id из тела запроса
      },
      reads: ['positions', 'receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    // --- ОСТАВЛЯЕМ СТАРЫЙ ACTION ДЛЯ ДЕМОНСТРАЦИИ ОБРАТНОЙ СОВМЕСТИМОСТИ ---
    'POST /action/clearReceipt': {
      type: 'action',
      handler: 'clearReceipt', // Использует JS-файл, т.к. нет 'manipulate'
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    // --- ПЕРЕПИСАННЫЙ ACTION ---
    'POST /action/removeItem': {
      type: 'action',
      // handler: 'removeItem', // Больше не нужен
      manipulate: {
        target: 'receipt.items',          // Цель: массив items в данных receipt
        operation: 'removeFirstWhere',    // Операция: удалить первый найденный
        match: { "id": "body.itemId" }    // Найти элемент, где id равен itemId из тела запроса
      },
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/filterPositions': {
      type: 'action',
      handler: 'filterPositions', // Этот action слишком сложен для declarative, оставляем JS
      reads: ['positions', 'viewState'],
      writes: ['viewState'],
      update: 'positionsList'
    }
  }
};