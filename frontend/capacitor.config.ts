import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.primafisoft.etcrm',
  appName: 'EasyTeam CRM',
  webDir: 'out',
  server: {
    url: 'https://etcrm.primafisoft.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#ffffff',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#ffffff',
  },
  plugins: {
    StatusBar: {
      style: 'dark',
      backgroundColor: '#ffffff',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
