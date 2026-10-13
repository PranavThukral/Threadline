import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app.js';
import { ErrorBoundary } from './error-boundary.js';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/krub/latin-500.css';
import '@fontsource/krub/latin-600.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
