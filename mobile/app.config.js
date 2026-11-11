// Extends app.json with Firebase settings from the native config files supplied at build time.
const fs = require('fs');
const path = require('path');

const ANDROID_FILE = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const IOS_FILE = process.env.GOOGLE_SERVICE_INFO_PLIST ?? './GoogleService-Info.plist';
const exists = (file) => fs.existsSync(path.resolve(__dirname, file));

function readPlist(file) {
  const xml = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  const out = {};
  for (const m of xml.matchAll(/<key>([^<]+)<\/key>\s*<(string|true|false)\s*\/?>\s*([^<]*)/g)) {
    out[m[1]] = m[2] === 'string' ? m[3].trim() : m[2] === 'true';
  }
  return out;
}

function firebaseExtra() {
  const extra = {};
  let iosPlist;
  if (exists(IOS_FILE)) {
    iosPlist = readPlist(IOS_FILE);
    extra.ios = {
      apiKey: iosPlist.API_KEY,
      appId: iosPlist.GOOGLE_APP_ID,
      projectId: iosPlist.PROJECT_ID,
      messagingSenderId: iosPlist.GCM_SENDER_ID,
      storageBucket: iosPlist.STORAGE_BUCKET,
      authDomain: `${iosPlist.PROJECT_ID}.firebaseapp.com`,
    };
  }
  if (exists(ANDROID_FILE)) {
    const json = JSON.parse(fs.readFileSync(path.resolve(__dirname, ANDROID_FILE), 'utf8'));
    const info = json.project_info;
    const client = json.client?.[0];
    if (info && client) {
      extra.android = {
        apiKey: client.api_key?.[0]?.current_key,
        appId: client.client_info?.mobilesdk_app_id,
        projectId: info.project_id,
        messagingSenderId: info.project_number,
        storageBucket: info.storage_bucket,
        authDomain: `${info.project_id}.firebaseapp.com`,
      };
      extra.googleWebClientId = client.oauth_client?.find((c) => c.client_type === 3)?.client_id;
    }
  }
  extra.googleWebClientId = process.env.GOOGLE_WEB_CLIENT_ID || extra.googleWebClientId;
  return { extra, iosReversedClientId: iosPlist?.REVERSED_CLIENT_ID };
}

module.exports = ({ config }) => {
  const { extra: firebase, iosReversedClientId } = firebaseExtra();
  const { googleWebClientId, ...firebaseOptions } = firebase;
  const plugins = (config.plugins ?? []).map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name !== '@react-native-google-signin/google-signin') return plugin;
    return [name, { ...(Array.isArray(plugin) ? plugin[1] : {}), ...(iosReversedClientId ? { iosUrlScheme: iosReversedClientId } : {}) }];
  });

  return {
    ...config,
    plugins,
    ios: { ...config.ios, ...(exists(IOS_FILE) ? { googleServicesFile: IOS_FILE } : {}) },
    android: { ...config.android, ...(exists(ANDROID_FILE) ? { googleServicesFile: ANDROID_FILE } : {}) },
    extra: { ...config.extra, firebase: firebaseOptions, googleWebClientId },
  };
};
