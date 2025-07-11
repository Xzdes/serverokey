// manifest.js

module.exports = {
  data: {
    receipt: { initialState: { items: [], total: '0.00' } },
    positions: {}
  },
  components: {
    mainLayout: 'main-layout.html',
    receipt: {
      template: 'receipt.html',
      style: 'receipt.css' // <-- Вот оно!
    },
    positionsList: {
      template: 'positionsList.html',
      style: 'positionsList.css' // <-- И здесь!
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
      type: 'action', handler: 'addItem', reads: ['positions', 'receipt'], writes: ['receipt'], update: 'receipt'
    },
    'POST /action/clearReceipt': {
      type: 'action', handler: 'clearReceipt', reads: ['receipt'], writes: ['receipt'], update: 'receipt'
    }
  }
};