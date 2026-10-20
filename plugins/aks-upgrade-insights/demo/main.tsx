import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/App';
import './preview.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing preview root.');
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
