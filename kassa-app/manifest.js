// manifest.js

module.exports = {
  data: {
    receipt: {
      initialState: { 
        items: [], 
        total: '0.00',
        itemCount: 0,
        discountPercent: 10,
        discount: '0.00',
        finalTotal: '0.00'
      },
      // Используем новый синтаксис с "formula"
      computed: [
        {
          "target": "itemCount",
          "formula": "count(items)"
        },
        {
          "target": "total",
          "formula": "sum(items, 'price')",
          "format": "toFixed(2)"
        },
        {
          "target": "discount",
          "formula": "total * (discountPercent / 100)",
          "format": "toFixed(2)"
        },
        {
          "target": "finalTotal",
          "formula": "total - discount",
          "format": "toFixed(2)"
        }
      ]
    },
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
      manipulate: {
        target: 'receipt.items',
        operation: 'push',
        source: 'positions.all',
        findBy: { "id": "body.id" }
      },
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
    'POST /action/removeItem': {
      type: 'action',
      manipulate: {
        target: 'receipt.items',
        operation: 'removeFirstWhere',
        match: { "id": "body.itemId" }
      },
      reads: ['receipt'],
      writes: ['receipt'],
      update: 'receipt'
    },
    'POST /action/filterPositions': {
      type: 'action',
      handler: 'filterPositions',
      reads: ['positions', 'viewState'],
      writes: ['viewState'],
      update: 'positionsList'
    }
  }
};