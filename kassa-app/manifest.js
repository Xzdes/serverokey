// manifest.js

module.exports = {
  // ... (секции data и components без изменений) ...
  data: {
    receipt: { initialState: { items: [], total: '0.00' } },
    positions: {}
  },
  components: {
    mainLayout: 'main-layout.html',
    receipt: 'receipt.html',
    positionsList: 'positionsList.html'
  },
  routes: {
    'GET /': {
      type: 'view',
      layout: 'mainLayout',
      inject: {
        'receipt_placeholder': 'receipt',
        'positions_placeholder': 'positionsList'
      }
    },
    'POST /action/addItem': {
      type: 'action', 
      handler: 'addItem', 
      reads: ['positions', 'receipt'], 
      writes: ['receipt'], 
      update: 'receipt'
    },
    // --- ИСПРАВЛЕННАЯ СЕКЦИЯ ---
    'POST /action/clearReceipt': {
      type: 'action',
      handler: 'clearReceipt',
      // Мы должны прочитать 'receipt', чтобы потом его изменить.
      reads: ['receipt'], 
      writes: ['receipt'],
      update: 'receipt'
    }
  }
};