const fs = require('fs');
const path = require('path');

let firebaseAdmin = null;
try {
  firebaseAdmin = require('firebase-admin');
} catch (_error) {
  firebaseAdmin = null;
}

let initialized = false;

function parseServiceAccount() {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson && inlineJson.trim()) {
    try {
      const parsed = JSON.parse(inlineJson);
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (error) {
      console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_JSON noto‘g‘ri:', error.message);
    }
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath && serviceAccountPath.trim()) {
    const trimmedPath = serviceAccountPath.trim();
    const candidatePaths = [
      path.resolve(trimmedPath),
      path.resolve(__dirname, '..', trimmedPath),
    ];

    for (const resolvedPath of candidatePaths) {
      if (!fs.existsSync(resolvedPath)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        if (parsed.private_key) {
          parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        }
        return parsed;
      } catch (error) {
        console.warn('⚠️ Service account fayli o‘qilmadi:', error.message);
      }
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

function initializeFirebaseAdmin() {
  if (!firebaseAdmin || initialized) {
    return initialized;
  }

  if (firebaseAdmin.apps && firebaseAdmin.apps.length > 0) {
    initialized = true;
    return true;
  }

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    console.warn('⚠️ Firebase Admin sozlanmagan, push yuborish o‘tkazib yuborildi.');
    return false;
  }

  const credentialFactory =
    firebaseAdmin.credential?.cert || firebaseAdmin.cert;

  if (typeof credentialFactory !== 'function') {
    console.warn('⚠️ Firebase Admin credential topilmadi, push yuborish o‘tkazib yuborildi.');
    return false;
  }

  firebaseAdmin.initializeApp({
    credential: credentialFactory(serviceAccount),
  });
  initialized = true;
  return true;
}

function normalizePushData(data) {
  return Object.entries(data || {}).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) {
      return acc;
    }
    acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
    return acc;
  }, {});
}

async function sendUserPushNotification({ token, title, body, data = {} }) {
  if (!token) {
    return false;
  }

  if (!initializeFirebaseAdmin()) {
    return false;
  }

  try {
    await firebaseAdmin.messaging().send({
      token,
      notification: {
        title: String(title ?? 'Bildirishnoma'),
        body: String(body ?? ''),
      },
      data: normalizePushData(data),
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    });
    return true;
  } catch (error) {
    console.warn('⚠️ Push notification yuborilmadi:', error.message);
    return false;
  }
}

module.exports = {
  sendUserPushNotification,
};
