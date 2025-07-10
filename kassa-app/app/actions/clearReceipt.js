// Еще одна простейшая функция
module.exports = (context, body) => {
  context.receipt.items = [];
  context.receipt.total = '0.00';
};