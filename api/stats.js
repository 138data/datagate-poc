export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    storageType: "Memory",
    asOf: new Date().toISOString(),
    filesTotal: 0,
    activeFiles: 0,
    downloadsTotal: 0,
    sizeTotalBytes: 0,
    uploadsLast24h: 0
  });
}
