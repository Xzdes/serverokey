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
      styles: {
        '#': {
          'border': '1px solid #ccc',
          'padding': '15px',
          'border-radius': '8px',
          'background-color': '#f9f9f9',
          'min-width': '300px'
        },
        '#clear-btn': {
          'background-color': '#ffdddd',
          'hover:background-color': '#ffbaba'
        }
      }
    },
    positionsList: {
      template: 'positionsList.html',
      styles: {
        '#': {
          'border': '1px solid #ccc',
          'padding': '15px',
          'border-radius': '8px'
        },
        'button': { 'margin-left': '10px' }
      }
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