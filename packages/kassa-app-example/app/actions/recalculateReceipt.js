// app/actions/recalculateReceipt.js
module.exports = [
  // Шаг 1: Вычисляем все как ЧИСЛА
  { "set": "context.tempTotal", "to": "receipt.items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0)" },
  { "set": "receipt.itemCount", "to": "receipt.items.reduce((sum, item) => sum + item.quantity, 0)" },
  { "set": "context.tempDiscount", "to": "context.tempTotal * (receipt.discountPercent / 100)" },
  { "set": "context.tempFinalTotal", "to": "context.tempTotal - context.tempDiscount" },
  
  // Шаг 2: Форматируем ЧИСЛА в СТРОКИ для отображения
  { "set": "receipt.total", "to": "context.tempTotal.toFixed(2)" },
  { "set": "receipt.discount", "to": "context.tempDiscount.toFixed(2)" },
  { "set": "receipt.finalTotal", "to": "context.tempFinalTotal.toFixed(2)" }
];