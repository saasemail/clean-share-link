// /api/fs-webhook.js — Vercel serverless endpoint (Node.js, no deps)
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks);

    const sig = req.headers['x-fs-signature'];
    const secret = process.env.FS_WEBHOOK_SECRET || '';
    if (!sig || !secret) return res.status(400).end('Missing signature or secret');

    const computed = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    if (sig !== computed) return res.status(400).end('BAD SIGNATURE');

    const payload = JSON.parse(raw.toString('utf8'));
    try {
      console.log('[FS WEBHOOK]', {
        id: payload.id,
        type: payload.type || (payload.events?.[0]?.type),
        order: payload.data?.orderReference || payload.events?.[0]?.data?.orderReference
      });
    } catch {}

    return res.status(200).end('OK');
  } catch (e) {
    console.error('FS webhook error', e);
    return res.status(500).end('ERR');
  }
};
