import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './App';
import './App.css';

// Create a root and render the Root component. React 18 recommends
// using createRoot from react-dom/client.
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
