// app/actions/filterPositions.js
module.exports = (context, body) => {
  const { positions, viewState } = context;
  const query = (body.query || '').toLowerCase().trim();

  viewState.query = body.query;

  // --- ИЗМЕНЕНИЕ: ищем в positions.items ---
  const sourceArray = positions.items || [];

  if (!query) {
    viewState.filtered = sourceArray;
  } else {
    viewState.filtered = sourceArray.filter(item => 
      item.name.toLowerCase().includes(query)
    );
  }
};