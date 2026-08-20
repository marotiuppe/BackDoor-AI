import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { OverlayView } from './components/OverlayView';
import './index.css';

const isOverlay = typeof window !== 'undefined' && window.location.hash.includes('overlay');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOverlay ? <OverlayView /> : <App />}
  </React.StrictMode>
);

