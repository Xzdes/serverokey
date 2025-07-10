// Изолированная, атомарная функция.
// Получает только то, что ей разрешено в manifest.js
module.exports = (context, body) => {
  const { positions, receipt } = context;
  const { id } = body; // id товара из формы

  const itemToAdd = positions.find(p => p.id == id);

  if (itemToAdd) {
    receipt.items.push(itemToAdd);
    
    // Пересчитываем сумму
    const newTotal = receipt.items.reduce((sum, item) => sum + parseFloat(item.price), 0);
    receipt.total = newTotal.toFixed(2);
  }
};