// app/actions/recalculateReceipt.js
module.exports = [
  // --- ШАГИ ВЫЧИСЛЕНИЯ (работаем с числами) ---
  { "set": "receipt.total", "to": "receipt.items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0)" },
  { "set": "receipt.itemCount", "to": "receipt.items.reduce((sum, item) => sum + item.quantity, 0)" },
  { "set": "receipt.discount", "to": "receipt.total * (receipt.discountPercent / 100)" },
  { "set": "receipt.finalTotal", "to": "receipt.total - receipt.discount" },
  
  // --- НОВЫЙ БЛОК: ШАГИ ФОРМАТИРОВАНИЯ (превращаем числа в строки для вывода) ---
  { "set": "receipt.total", "to": "receipt.total.toFixed(2)" },
  { "set": "receipt.discount", "to": "receipt.discount.toFixed(2)" },
  { "set": "receipt.finalTotal", "to": "receipt.finalTotal.toFixed(2)" }
];