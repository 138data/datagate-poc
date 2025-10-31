// api/test-real-upload.js
import { Readable } from 'stream';
import busboy from 'busboy';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bb = busboy({ headers: req.headers });
    const files = [];
    const fields = {};

    bb.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      file.on('end', () => {
        files.push({
          fieldname,
          filename,
          encoding,
          mimeType,
          size: Buffer.concat(chunks).length
        });
      });
    });

    bb.on('field', (fieldname, value) => {
      fields[fieldname] = value;
    });

    bb.on('finish', () => {
      res.status(200).json({
        success: true,
        files,
        fields
      });
    });

    bb.on('error', (error) => {
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    });

    req.pipe(bb);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
