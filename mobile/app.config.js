// Extends app.json with the Firebase project settings, read from the native config files that the
// Firebase console issues for this app (see README → "Credentials").

const fs = require('fs');
const path = require('path');

/**
 * Locally the files sit in the project root (git-ignored). On EAS Build, upload them as "file"
 * environment variables named GOOGLE_SERVICES_JSON and GOOGLE_SERVICE_INFO_PLIST; EAS then sets
 * those variables to the files' paths on the build machine.
 */
const ANDROID_FILE = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const IOS_FILE = process.env.GOOGLE_SERVICE_INFO_PLIST ?? './GoogleService-Info.plist';

const exists = (file) => fs.existsSync(path.resolve(__dirname, file));

/** Minimal reader for the flat <key>/<string> pairs in GoogleService-Info.plist. */
function readPlist(file) {
  const xml = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  const out = {};
  for (const m of xml.matchAll(/<key>([^<]+)<\/key>\s*<(string|true|false)\s*\/?>([^<]*)/g)) {
    out[m[1]] = m[2] === 'string' ? m[3] : m[2] === 'true';
  }
  return out;
}

/** The Firebase JS SDK options for each platform's registered app, plus the Google web client ID. */
function firebaseExtra() {
  const extra = {};
  if (exists(IOS_FILE)) {
    const p = readPlist(IOS_FILE);
    extra.ios = {
      apiKey: p.API_KEY,
      appId: p.GOOGLE_APP_ID,
      projectId: p.PROJECT_ID,
      messagingSenderId: p.GCM_SENDER_ID,
      storageBucket: p.STORAGE_BUCKET,
      authDomain: `${p.PROJECT_ID}.firebaseapp.com`,
    };
  }
  if (exists(ANDROID_FILE)) {
    const json = JSON.parse(fs.readFileSync(path.resolve(__dirname, ANDROID_FILE), 'utf8'));
    const { project_info: info, client: [client] } = json;
    extra.android = {
      apiKey: client.api_key[0].current_key,
      appId: client.client_info.mobilesdk_app_id,
      projectId: info.project_id,
      messagingSenderId: info.project_number,
      storageBucket: info.storage_bucket,
      authDomain: `${info.project_id}.firebaseapp.com`,
    };
    // the "web" OAuth client (type 3) — Google Sign-In uses it so the ID token is valid for Firebase Auth
    extra.googleWebClientId = client.oauth_client?.find((c) => c.client_type === 3)?.client_id;
  }
  extra.googleWebClientId = process.env.GOOGLE_WEB_CLIENT_ID || extra.googleWebClientId;
  return extra;
}

module.exports = ({ config }) => ({
  ...config,
  ios: { ...config.ios, ...(exists(IOS_FILE) ? { googleServicesFile: IOS_FILE } : null) },
  android: { ...config.android, ...(exists(ANDROID_FILE) ? { googleServicesFile: ANDROID_FILE } : null) },
  extra: { ...config.extra, firebase: firebaseExtra() },
});
