// app/actions/clearReceipt.js
module.exports = (context, body) => {
  context.receipt.items = [];
  context.receipt.total = '0.00';
};