import React, { useMemo } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const DEFAULT_API_BASE_URL = 'https://language.petyabouianov.com';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
const NIHONGO_URL = `${API_BASE_URL.replace(/\/+$/, '')}/nihongo-studio`;
const ALLOWED_ORIGIN = 'https://language.petyabouianov.com';
const ALLOWED_HOST = 'language.petyabouianov.com';

function isAllowedNavigation(url) {
  if (!url) return false;
  if (url.startsWith('about:blank')) return true;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === ALLOWED_HOST;
  } catch (e) {
    return false;
  }
}

export default function App() {
  const source = useMemo(() => ({ uri: NIHONGO_URL }), []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <WebView
        source={source}
        style={styles.webview}
        startInLoadingState
        allowsBackForwardNavigationGestures
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={[ALLOWED_ORIGIN]}
        onShouldStartLoadWithRequest={(request) => isAllowedNavigation(request?.url)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 }
});
