// api/pair.js — Vercel appelle directement le bot sur FreeGameHost

const BOT_API_URL = 'http://us1.freegamehost.xyz:6679/pair';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const { phone } = req.body || {};
  if (!phone || phone.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: 'Numéro invalide.' });
  }

  try {
    const botRes = await fetch(BOT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone.replace(/\D/g, '') })
    });

    const data = await botRes.json();

    if (!botRes.ok || !data.success) {
      return res.status(500).json({ error: data.error || 'Erreur bot.' });
    }

    return res.status(200).json({ success: true, code: data.code, phone: data.phone });

  } catch (err) {
    console.error('Erreur:', err.message);
    return res.status(500).json({ error: 'Bot inaccessible. Réessayez.' });
  }
};
    
