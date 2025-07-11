// manifest.js

module.exports = {
  // Добавляем viewState для управления состоянием интерфейса (поиском)
  // И меняем структуру positions, чтобы был мастер-список
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
    'POST /action/addItem': {
      type: 'action',
      handler: 'addItem',
      reads: ['positions', 'receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/clearReceipt': {
      type: 'action',
      handler: 'clearReceipt',
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    // Новый action для удаления одного товара
    'POST /action/removeItem': {
      type: 'action',
      handler: 'removeItem',
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    // Новый action для фильтрации списка товаров
    'POST /action/filterPositions': {
      type: 'action',
      handler: 'filterPositions',
      reads: ['positions', 'viewState'],
      writes: ['viewState'],
      update: 'positionsList'
    }
  }
};