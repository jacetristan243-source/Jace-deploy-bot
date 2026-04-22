// api/pair.js — Vercel Serverless Function
// Génère un pairing code WhatsApp via Baileys

const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const logger = pino({ level: 'silent' });

// Dossier temporaire Vercel pour stocker les sessions
const TMP_DIR = '/tmp/jacebot_sessions';

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Enregistrement des connexions (en mémoire + fichier JSON dans /tmp)
const USERS_FILE = '/tmp/jacebot_users.json';

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveUser(phone, code, countryCode) {
  const users = loadUsers();
  const now = new Date().toISOString();

  const weekDate = new Date();
  const day = weekDate.getDay();
  const diff = weekDate.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(weekDate.setDate(diff)).toISOString().split('T')[0];

  const existing = users.findIndex(u => u.phone === phone);

  if (existing >= 0) {
    users[existing].lastSeen = now;
    users[existing].status = 'pending';
    users[existing].connections = (users[existing].connections || 0) + 1;
  } else {
    users.unshift({
      id: Date.now(),
      phone,
      countryCode,
      status: 'pending',
      connectedAt: now,
      lastSeen: now,
      weekStart,
      connections: 1
    });
  }

  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Erreur écriture users:', e.message);
  }
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const { phone } = req.body || {};

  if (!phone || phone.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
  }

  const cleanPhone = phone.replace(/\D/g, '');
  const authFolder = path.join(TMP_DIR, `auth_${cleanPhone}`);

  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 20000,
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout connexion')), 15000);

      sock.ev.on('connection.update', async (update) => {
        const { connection } = update;

        if (connection === 'open' || (!sock.authState.creds.registered)) {
          clearTimeout(timeout);
          resolve();
        }
      });

      sock.ev.on('creds.update', saveCreds);
    });

    // Générer le pairing code
    const code = await sock.requestPairingCode(cleanPhone);

    // Détecter l'indicatif pays
    let countryCode = '0';
    const countryCodes = ['241','225','237','243','242','221','212','213','216','229','226','223','228','227','235','236','255','254','234','27','33','1','44','49','34','55'];
    for (const cc of countryCodes) {
      if (cleanPhone.startsWith(cc)) { countryCode = cc; break; }
    }

    // Sauvegarder l'utilisateur
    saveUser(cleanPhone, code, countryCode);

    // Fermer proprement la connexion
    setTimeout(() => {
      try { sock.end(); } catch (e) {}
    }, 2000);

    return res.status(200).json({
      success: true,
      code: code,
      phone: cleanPhone
    });

  } catch (err) {
    console.error('Erreur pair:', err.message);
    return res.status(500).json({
      error: 'Impossible de générer le code. Vérifiez le numéro et réessayez.',
      detail: err.message
    });
  }
};
                     
