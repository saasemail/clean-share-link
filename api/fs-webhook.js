// /api/fs-webhook.js — Vercel serverless endpoint (Node.js, no deps)
const crypto = require('crypto');

module.exports = async (req, res) => {
  // FastSpring šalje POST sa JSON telom i headerom X-FS-Signature (base64 HMAC-SHA256)
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  try {
    // 1) Skupi RAW body (mora raw zbog potpisa)
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks);

    // 2) Izvuci potpis i secret
    const sig = req.headers['x-fs-signature'];
    const secret = process.env.FS_WEBHOOK_SECRET || '';
    if (!sig || !secret) return res.status(400).end('Missing signature or secret');

    // 3) Izračunaj HMAC(SHA256, base64) nad RAW telom
    const computed = crypto
      .createHmac('sha256', secret)
      .update(raw)
      .digest('base64');

    if (sig !== computed) {
      return res.status(400).end('BAD SIGNATURE');
    }

    // 4) Bezbedno parsiraj JSON tek POSLE validacije potpisa
    const payload = JSON.parse(raw.toString('utf8'));

    // (Opcionalno) Minimalan log u Vercel logs za evidenciju
    // Tipični eventi: order.completed, subscription.activated, subscription.canceled, charge.failed...
    try {
      console.log('[FS WEBHOOK]', {
        id: payload.id,
        type: payload.type || (payload.events?.[0]?.type),
        order: payload.data?.orderReference || payload.events?.[0]?.data?.orderReference
      });
    } catch {}

    // TODO (kasnije): upis u bazu / slanje e-maila / Slack notifikacija itd.

    return res.status(200).end('OK');
  } catch (e) {
    console.error('FS webhook error', e);
    return res.status(500).end('ERR');
  }
};
