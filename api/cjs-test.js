module.exports = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'CommonJS test',
    timestamp: new Date().toISOString()
  });
};
