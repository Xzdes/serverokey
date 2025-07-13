// app/actions/recalculateReceipt.js
module.exports = [
  // Шаг 1: Считаем базовые суммы. Здесь ошибки обычно нет.
  { "set": "context.tempTotal", "to": "receipt.items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0)" },
  { "set": "receipt.total", "to": "context.tempTotal" },
  { "set": "receipt.itemCount", "to": "receipt.items.reduce((sum, item) => sum + item.quantity, 0)" },
  
  // --- КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ ЗДЕСЬ ---
  // Шаг 2: Считаем скидку и ИТОГ, немедленно округляя результат до 2 знаков.
  // Мы используем Math.round(...) для получения корректного ЧИСЛА, а не строки.
  
  { 
    "set": "receipt.discount", 
    "to": "Math.round((receipt.total * (receipt.discountPercent / 100)) * 100) / 100" 
  },
  { 
    "set": "receipt.finalTotal", 
    "to": "Math.round((receipt.total - receipt.discount) * 100) / 100" 
  }
];