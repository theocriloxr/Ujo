import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Capacitor} from '@capacitor/core';
import App from './App.tsx';
import AuthGate from './AuthGate.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate><App /></AuthGate>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
