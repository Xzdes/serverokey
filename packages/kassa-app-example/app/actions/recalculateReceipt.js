// app/actions/recalculateReceipt.js
module.exports = [
  // Шаг 1: Считаем базовые суммы
  { "set": "context.tempTotal", "to": "data.receipt.items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0)" },
  { "set": "data.receipt.total", "to": "context.tempTotal" },
  { "set": "data.receipt.itemCount", "to": "data.receipt.items.reduce((sum, item) => sum + item.quantity, 0)" },
  
  // Шаг 2: Считаем скидку и ИТОГ
  { 
    "set": "data.receipt.discount", 
    "to": "Math.round((data.receipt.total * (data.receipt.discountPercent / 100)) * 100) / 100" 
  },
  { 
    "set": "data.receipt.finalTotal", 
    "to": "Math.round((data.receipt.total - data.receipt.discount) * 100) / 100" 
  }
];