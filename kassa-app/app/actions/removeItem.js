// app/actions/removeItem.js
module.exports = (context, body) => {
  const { receipt } = context;
  const indexToRemove = parseInt(body.index, 10);

  // Проверка, что индекс валидный
  if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < receipt.items.length) {
    receipt.items.splice(indexToRemove, 1);
    
    // Пересчитываем сумму
    const newTotal = receipt.items.reduce((sum, item) => sum + parseFloat(item.price), 0);
    receipt.total = newTotal.toFixed(2);
  }
};