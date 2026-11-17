import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.yangyizhi.mobile',
  appName: '养一只',
  webDir: 'dist',
  backgroundColor: '#f7f4ec',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: false,
  },
  android: {
    path: 'clients/android',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  loggingBehavior: 'none',
};

export default config;
