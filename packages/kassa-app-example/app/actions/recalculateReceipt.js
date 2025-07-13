// app/actions/recalculateReceipt.js
module.exports = [
  // Шаг 1: Вычисляем все как ЧИСЛА
  { "set": "context.tempTotal", "to": "receipt.items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0)" },
  { "set": "receipt.total", "to": "context.tempTotal" },
  { "set": "receipt.itemCount", "to": "receipt.items.reduce((sum, item) => sum + item.quantity, 0)" },
  { "set": "receipt.discount", "to": "receipt.total * (receipt.discountPercent / 100)" },
  { "set": "receipt.finalTotal", "to": "receipt.total - receipt.discount" }
];