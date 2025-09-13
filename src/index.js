import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { DBProvider } from './context/DBContext';
import { UIProvider } from './context/UIContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <DBProvider>
      <UIProvider>
        <App />
      </UIProvider>
    </DBProvider>
  </React.StrictMode>
);
