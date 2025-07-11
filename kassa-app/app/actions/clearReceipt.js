// app/actions/clearReceipt.js

// Этот action очищает массив items в чеке.
// Пересчет итоговой суммы происходит автоматически благодаря
// секции 'computed' в manifest.js.
module.exports = (context, body) => {
  context.receipt.items = [];
};