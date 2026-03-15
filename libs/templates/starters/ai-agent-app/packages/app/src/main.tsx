import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './styles/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found in index.html');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
