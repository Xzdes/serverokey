// packages/kassa-app-example/app/actions/filterPositions.js
module.exports = (context, body) => {
  // ИЗМЕНЕНИЕ: Достаем коннекторы из объекта data
  const { positions, viewState } = context.data;
  const query = (body.query || '').toLowerCase().trim();

  viewState.query = body.query;

  const sourceArray = positions.items || [];

  if (!query) {
    viewState.filtered = sourceArray;
  } else {
    viewState.filtered = sourceArray.filter(item => 
      item.name && typeof item.name === 'string' && item.name.toLowerCase().includes(query)
    );
  }
};