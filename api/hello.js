module.exports = async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).end(JSON.stringify({
      success: true,
      message: 'Hello from Node handler',
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url
    }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ 
      success: false, 
      error: e.message 
    }));
  }
};
