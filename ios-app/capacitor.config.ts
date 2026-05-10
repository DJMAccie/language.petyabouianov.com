import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.petyabouianov.nihongostudio',
  appName: 'Nihongo Studio',
  webDir: 'web',
  server: {
    iosScheme: 'https'
  },
  ios: {
    contentInset: 'always',
    scrollEnabled: true
  }
};

export default config;
