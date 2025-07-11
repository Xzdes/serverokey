// app/actions/removeItem.js
module.exports = (context, body) => {
  const { receipt } = context;
  const idToRemove = parseInt(body.itemId, 10);

  if (!isNaN(idToRemove)) {
    // Находим ПЕРВЫЙ встретившийся товар с таким ID и удаляем его.
    // Это корректно обработает дубликаты в чеке.
    const indexToRemove = receipt.items.findIndex(item => item.id === idToRemove);
    
    if (indexToRemove > -1) {
      receipt.items.splice(indexToRemove, 1);
      
      // Пересчитываем сумму
      const newTotal = receipt.items.reduce((sum, item) => sum + parseFloat(item.price), 0);
      receipt.total = newTotal.toFixed(2);
    }
  }
};