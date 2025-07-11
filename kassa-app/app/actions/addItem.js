// app/actions/addItem.js
module.exports = (context, body) => {
  const { positions, receipt } = context;
  const { id } = body;

  // Ищем товар в мастер-списке positions.all
  const itemToAdd = positions.all.find(p => p.id == id);

  if (itemToAdd) {
    receipt.items.push(itemToAdd);
    
    const newTotal = receipt.items.reduce((sum, item) => sum + parseFloat(item.price), 0);
    receipt.total = newTotal.toFixed(2);
  }
};