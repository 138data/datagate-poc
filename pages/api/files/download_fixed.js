import { kv } from '@vercel/kv';
import crypto from 'crypto';
export const config = {
  api: {
    bodyParser: false,
  },
};
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { fileId } = req.query;
    if (!fileId) {
      return res.status(400).json({ error: 'ファイルIDが指定されていません' });
    }
    try {
      const metadata = await kv.get(`file:${fileId}:meta`);