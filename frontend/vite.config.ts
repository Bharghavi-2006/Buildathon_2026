import { defineConfig, ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// '/campaigns/*' and '/monitoring' are both real backend REST paths (called via
// axios/XHR from inside the already-loaded app) AND client-side React Router
// pages of the same name. A blanket proxy on those prefixes intercepts a full
// page navigation (a hard refresh, a typed URL, a bookmark) before Vite's own
// SPA fallback gets a chance to serve index.html, so the browser shows a raw
// backend JSON error instead of the app. Only forward requests that look like
// an API call (not a browser document navigation) for those two prefixes.
const bypassNavigation: ProxyOptions['bypass'] = (req) => {
  if (req.headers.accept?.includes('text/html')) {
    return '/index.html';
  }
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/campaigns': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassNavigation,
      },
      '/prospects': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/agents': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/approvals': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/team': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/monitoring': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassNavigation,
      },
      '/me': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/control': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/conversations': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/webhooks': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/knowledge': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/dashboard': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    }
  }
});
