import React, { useMemo } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const DEFAULT_API_BASE_URL = 'https://language.petyabouianov.com';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
const NIHONGO_URL = `${API_BASE_URL.replace(/\/+$/, '')}/nihongo-studio`;
const ALLOWED_ORIGIN = 'https://language.petyabouianov.com';
const ALLOWED_HOST = 'language.petyabouianov.com';
const APP_ONLY_UI_INJECTION = `
(() => {
  const STYLE_ID = 'nihongo-go-app-only-ui-v2';
  const ROW_SELECTOR = '#list-table-body tr';
  const LIST_STATE_ATTR = 'data-ng-app-list-state';
  let pollCount = 0;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = \`
      .ng-app-list-row {
        position: relative;
        animation: ngAppRowIn 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .ng-app-list-row td:first-child {
        border-left: 3px solid transparent;
      }
      .ng-app-list-row.ng-app-state-new {
        background: #f8fafc;
      }
      .ng-app-list-row.ng-app-state-new td:first-child {
        border-left-color: #cbd5e1;
      }
      .ng-app-list-row.ng-app-state-learning {
        background: #fffbeb;
      }
      .ng-app-list-row.ng-app-state-learning td:first-child {
        border-left-color: #f59e0b;
      }
      .ng-app-list-row.ng-app-state-mastered {
        background: #ecfdf3;
      }
      .ng-app-list-row.ng-app-state-mastered td:first-child {
        border-left-color: #16a34a;
      }
      .ng-app-list-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.625rem;
      }
      .ng-app-list-name {
        min-width: 0;
        display: inline-flex;
        align-items: center;
      }
      .ng-app-status-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 9999px;
        padding: 0.18rem 0.62rem;
        font-size: 0.66rem;
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .ng-app-status-chip.ng-app-state-new {
        background: #e2e8f0;
        color: #475569;
      }
      .ng-app-status-chip.ng-app-state-learning {
        background: #fef3c7;
        color: #92400e;
      }
      .ng-app-status-chip.ng-app-state-mastered {
        background: #dcfce7;
        color: #166534;
        animation: ngAppMasteredPulse 2.8s ease-in-out infinite;
      }
      .ng-app-row-meta {
        display: none;
      }
      .ng-app-start-primary {
        min-height: 2.2rem !important;
        padding: 0.38rem 0.94rem !important;
        border: 1px solid rgba(37, 99, 235, 0.3) !important;
        border-radius: 9999px !important;
        background: linear-gradient(180deg, #4f8ef8 0%, #2563eb 100%) !important;
        color: #eff6ff !important;
        box-shadow: 0 10px 16px -12px rgba(37, 99, 235, 0.9) !important;
        font-size: 0.76rem !important;
        letter-spacing: 0.01em !important;
        transition: transform 0.14s ease, filter 0.14s ease, box-shadow 0.14s ease !important;
      }
      .ng-app-start-primary:active {
        transform: scale(0.97);
        filter: saturate(0.94);
      }
      .ng-app-start-primary:hover {
        color: #ffffff !important;
      }
      .ng-app-secondary {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      @media (max-width: 767px) {
        #system-bar {
          padding: 0.72rem !important;
        }
        #system-bar .w-full.flex.flex-col.md\\\\:flex-row {
          gap: 0.62rem !important;
        }
        .studio-toolbar-actions {
          gap: 0.5rem !important;
        }
        #list-table-body .ng-app-list-row {
          display: block;
          border-bottom: 1px solid #e5e7eb;
        }
        #list-table-body .ng-app-list-row td {
          display: block;
          width: 100%;
        }
        #list-table-body .ng-app-list-row td:nth-child(2),
        #list-table-body .ng-app-list-row td:nth-child(3),
        #list-table-body .ng-app-list-row td:nth-child(4) {
          display: none !important;
        }
        #list-table-body .ng-app-list-row td:nth-child(1) {
          padding: 0.85rem 1rem 0.45rem !important;
        }
        #list-table-body .ng-app-list-row td:nth-child(5) {
          padding: 0.25rem 1rem 0.9rem !important;
          text-align: left !important;
        }
        #list-table-body .ng-app-list-row .ng-app-row-meta {
          display: inline-flex;
          align-items: center;
          gap: 0.42rem;
          margin-top: 0.12rem;
          font-size: 0.74rem;
          color: #6b7280;
        }
        #list-table-body .ng-app-list-row .studio-table-action-bar {
          justify-content: flex-start;
          align-items: stretch;
          flex-direction: column;
          gap: 0.55rem;
          width: 100%;
        }
        #list-table-body .ng-app-list-row .ng-app-secondary {
          order: 2;
          justify-content: flex-start;
        }
        #list-table-body .ng-app-list-row .ng-app-start-primary {
          order: 1;
          width: max-content;
          min-width: 8.5rem;
          min-height: 2.35rem;
          padding: 0.5rem 1rem !important;
          font-size: 0.83rem !important;
        }
      }
      body.dark .ng-app-list-row.ng-app-state-new {
        background: #1f2937;
      }
      body.dark .ng-app-list-row.ng-app-state-learning {
        background: #352612;
      }
      body.dark .ng-app-list-row.ng-app-state-mastered {
        background: #142b1c;
      }
      body.dark .ng-app-status-chip.ng-app-state-new {
        background: #334155;
        color: #cbd5e1;
      }
      body.dark .ng-app-status-chip.ng-app-state-learning {
        background: #5a3d12;
        color: #fde68a;
      }
      body.dark .ng-app-status-chip.ng-app-state-mastered {
        background: #1f4730;
        color: #bbf7d0;
      }
      body.dark .ng-app-start-primary {
        background: linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%) !important;
        border-color: rgba(96, 165, 250, 0.5) !important;
        color: #eff6ff !important;
      }
      body.dark #list-table-body .ng-app-list-row .ng-app-row-meta {
        color: #9ca3af;
      }
      @keyframes ngAppRowIn {
        from { opacity: 0; transform: translateY(7px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes ngAppMasteredPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.12); }
        50% { box-shadow: 0 0 0 7px rgba(22, 163, 74, 0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .ng-app-list-row,
        .ng-app-status-chip.ng-app-state-mastered,
        .ng-app-start-primary {
          animation: none !important;
          transition-duration: 0.01ms !important;
        }
      }
    \`;
    document.head.appendChild(style);
  }

  function getStatus(scoreValue) {
    if (scoreValue > 80) return { key: 'mastered', label: 'Mastered' };
    if (scoreValue > 0) return { key: 'learning', label: 'Learning' };
    return { key: 'new', label: 'New' };
  }

  function parseScore(scoreCell) {
    if (!scoreCell) return 0;
    const raw = (scoreCell.textContent || '').replace('%', '').trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isMainListRow(row) {
    const actionCell = row?.cells?.[4];
    if (!actionCell) return false;
    return !!actionCell.querySelector('button[onclick^="startQuiz"]');
  }

  function enhanceActionCell(actionCell) {
    const actionBar = actionCell?.querySelector('.studio-table-action-bar');
    if (!actionBar) return;

    const startButton = actionBar.querySelector('button[onclick^="startQuiz"]');
    if (startButton) startButton.classList.add('ng-app-start-primary');

    let secondary = actionBar.querySelector('.ng-app-secondary');
    if (!secondary) {
      secondary = document.createElement('div');
      secondary.className = 'ng-app-secondary';
    }

    const iconButtons = Array.from(actionBar.querySelectorAll('.studio-table-icon-btn'));
    iconButtons.forEach((btn) => {
      if (btn.parentElement !== secondary) secondary.appendChild(btn);
    });

    if (startButton && startButton.parentElement !== actionBar) {
      actionBar.insertBefore(startButton, actionBar.firstChild);
    }

    if (secondary.parentElement !== actionBar) {
      actionBar.appendChild(secondary);
    }
  }

  function enhanceRow(row, index) {
    if (!isMainListRow(row)) return;

    const scoreCell = row.cells[2];
    const wordsCell = row.cells[1];
    const firstCell = row.cells[0];
    const actionCell = row.cells[4];
    if (!firstCell || !actionCell) return;

    const status = getStatus(parseScore(scoreCell));
    row.classList.add('ng-app-list-row');
    row.classList.remove('ng-app-state-new', 'ng-app-state-learning', 'ng-app-state-mastered');
    row.classList.add(\`ng-app-state-\${status.key}\`);
    row.setAttribute(LIST_STATE_ATTR, status.key);
    row.style.setProperty('--row-index', String(index + 1));

    let top = firstCell.querySelector('.ng-app-list-top');
    if (!top) {
      const current = firstCell.innerHTML;
      firstCell.innerHTML = \`<div class="ng-app-list-top"><span class="ng-app-list-name">\${current}</span></div>\`;
      top = firstCell.querySelector('.ng-app-list-top');
    }

    let chip = firstCell.querySelector('.ng-app-status-chip');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'ng-app-status-chip';
      top.appendChild(chip);
    }
    chip.className = \`ng-app-status-chip ng-app-state-\${status.key}\`;
    chip.textContent = status.label;

    let meta = firstCell.querySelector('.ng-app-row-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'ng-app-row-meta';
      firstCell.appendChild(meta);
    }
    const wordsText = (wordsCell?.textContent || '').trim() || '0 words';
    const scoreText = \`\${parseScore(scoreCell)}% accuracy\`;
    const nextMeta = \`<span>\${wordsText}</span><span>•</span><span>\${scoreText}</span>\`;
    if (meta.innerHTML !== nextMeta) {
      meta.innerHTML = nextMeta;
    }

    enhanceActionCell(actionCell);
  }

  function enhanceTable() {
    injectStyles();
    const rows = Array.from(document.querySelectorAll(ROW_SELECTOR));
    rows.forEach((row, index) => enhanceRow(row, index));
    return rows.some(isMainListRow);
  }

  function setup() {
    const tick = () => {
      pollCount += 1;
      enhanceTable();
      if (pollCount < 240) {
        window.setTimeout(tick, 500);
      }
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }

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
        cacheEnabled={false}
        originWhitelist={[ALLOWED_ORIGIN]}
        injectedJavaScript={APP_ONLY_UI_INJECTION}
        onShouldStartLoadWithRequest={(request) => isAllowedNavigation(request?.url)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 }
});
