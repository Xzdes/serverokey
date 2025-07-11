// app/actions/filterPositions.js
module.exports = (context, body) => {
  const { positions, viewState } = context;
  const query = (body.query || '').toLowerCase().trim();

  viewState.query = body.query; // Сохраняем исходный запрос для value в input

  if (!query) {
    viewState.filtered = positions.all; // Если запрос пуст, показываем всё
  } else {
    viewState.filtered = positions.all.filter(item => 
      item.name.toLowerCase().includes(query)
    );
  }
};