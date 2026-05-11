import React, { useCallback, useMemo, useRef } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const DEFAULT_API_BASE_URL = 'https://language.petyabouianov.com';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
const NIHONGO_URL = `${API_BASE_URL.replace(/\/+$/, '')}/nihongo-studio`;
const ALLOWED_ORIGIN = 'https://language.petyabouianov.com';
const ALLOWED_HOST = 'language.petyabouianov.com';
const APP_ONLY_UI_INJECTION = `
(() => {
  const STYLE_ID = 'nihongo-go-mastered-only-v1';
  const OLD_STYLE_IDS = [
    'nihongo-go-app-only-ui-v1',
    'nihongo-go-app-only-ui-v2'
  ];
  const ROW_SELECTOR = '#list-table-body tr';
  let pollCount = 0;

  function injectStyles() {
    OLD_STYLE_IDS.forEach((id) => document.getElementById(id)?.remove());
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = \`
      #list-table-body tr.ng-app-mastered-row,
      #list-table-body tr.ng-app-mastered-row > td {
        background-color: #dcfce7 !important;
      }

      #list-table-body tr.ng-app-mastered-row > td:first-child {
        box-shadow: inset 5px 0 0 #16a34a !important;
      }

      body.dark #list-table-body tr.ng-app-mastered-row,
      body.dark #list-table-body tr.ng-app-mastered-row > td {
        background-color: #14351f !important;
      }

      body.dark #list-table-body tr.ng-app-mastered-row > td:first-child {
        box-shadow: inset 5px 0 0 #22c55e !important;
      }
    \`;
    document.head.appendChild(style);
  }

  function cleanupOldSkin(row) {
    row.querySelectorAll('.ng-app-status-flag, .ng-app-status-chip, .ng-app-row-meta').forEach((node) => node.remove());

    const firstCell = row.cells?.[0];
    const oldTop = firstCell?.querySelector('.ng-app-list-top');
    const oldName = oldTop?.querySelector('.ng-app-list-name');
    if (firstCell && oldTop && oldName) {
      firstCell.innerHTML = oldName.innerHTML;
    }

    row.querySelectorAll('.ng-app-secondary').forEach((wrapper) => {
      const parent = wrapper.parentNode;
      if (!parent) return;
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      wrapper.remove();
    });

    row.querySelectorAll('.ng-app-start-primary').forEach((node) => {
      node.classList.remove('ng-app-start-primary');
    });

    row.classList.remove(
      'ng-app-list-row',
      'ng-app-state-new',
      'ng-app-state-learning',
      'ng-app-state-mastered',
      'ng-app-mastered-row'
    );
  }

  function parseScore(row) {
    const raw = row.cells?.[2]?.textContent || '';
    const parsed = Number.parseInt(raw.replace('%', '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isMainListRow(row) {
    return !!row?.cells?.[4]?.querySelector('button[onclick^="startQuiz"]');
  }

  function isMasteredRow(row) {
    const statusText = (row.cells?.[3]?.textContent || '').toLowerCase();
    return statusText.includes('mastered') || parseScore(row) > 80;
  }

  function applyMasteredRows() {
    injectStyles();
    document.querySelectorAll(ROW_SELECTOR).forEach((row) => {
      cleanupOldSkin(row);
      if (!isMainListRow(row)) return;
      row.classList.toggle('ng-app-mastered-row', isMasteredRow(row));
    });
  }

  function pollRows() {
    pollCount += 1;
    applyMasteredRows();
    if (pollCount < 180) {
      window.setTimeout(pollRows, 750);
    }
  }

  pollRows();

  true;
})();
`;

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
  const webViewRef = useRef(null);
  const injectAppSkin = useCallback(() => {
    webViewRef.current?.injectJavaScript(APP_ONLY_UI_INJECTION);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <WebView
        ref={webViewRef}
        source={source}
        style={styles.webview}
        startInLoadingState
        allowsBackForwardNavigationGestures
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        originWhitelist={[ALLOWED_ORIGIN]}
        injectedJavaScript={APP_ONLY_UI_INJECTION}
        onLoadEnd={injectAppSkin}
        onShouldStartLoadWithRequest={(request) => isAllowedNavigation(request?.url)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 }
});
