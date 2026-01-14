export function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  res.status(500).send(err.message || 'Internal server error');
}
