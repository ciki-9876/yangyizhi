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
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_yangyizhi',
      iconColor: '#FFD23F',
    },
  },
};

export default config;
