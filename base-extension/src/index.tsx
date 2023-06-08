import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './Popup';
import PageScript from "./PageScript";

if (window.location.href.startsWith("chrome-extension://")) {
  ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  ).render(
    <React.StrictMode>
      <Popup/>
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  ).render(
    <React.StrictMode>
      <PageScript/>
    </React.StrictMode>
  );
}

