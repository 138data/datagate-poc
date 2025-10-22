export default function handler(req, res) {
  const uploadsByDay = [];
  const now = Date.now();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    uploadsByDay.push({ date, count: 0 });
  }
  
  res.status(200).json({
    ok: true,
    asOf: new Date().toISOString(),
    uploadsLast24h: 0,
    uploadsByDay,
    downloadsTotalObserved: 0,
    counters: {
      uploadsTotal: 0,
      downloadsTotal: 0
    }
  });
}
