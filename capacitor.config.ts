import type { CapacitorConfig } from '@capacitor/cli';

const mobileServerUrl = process.env.UJO_MOBILE_SERVER_URL || 'https://ujo-home.local';
if (!mobileServerUrl.startsWith('https://')) {
  throw new Error('UJO_MOBILE_SERVER_URL must use HTTPS. Cleartext smart-home sessions are not supported.');
}

const config: CapacitorConfig = {
  appId: 'home.ujo.app',
  appName: 'Ujo',
  webDir: 'dist',
  server: {
    url: mobileServerUrl,
    cleartext: false,
    allowNavigation: [new URL(mobileServerUrl).hostname]
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#050505'
  },
  ios: {
    backgroundColor: '#050505',
    contentInset: 'automatic'
  }
};

export default config;
