import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import { PlaygroundRoute } from './routes/playground';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element found');

createRoot(root).render(
  <React.StrictMode>
    <PlaygroundRoute />
  </React.StrictMode>
);
