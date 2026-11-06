import React, { lazy, Suspense } from 'react';
const Dashboard = lazy(() => import('./Dashboard.jsx'));
const Widget = lazy(() => import('./LegacyApp.jsx'));

export default function App() {
  const widget = window.location.hash.replace(/^#\/?/, '') === 'widget';
  return <Suspense fallback={<span role="status" style={{fontFamily:'Segoe UI, sans-serif',padding:16,display:'block'}}>Codex Pulse…</span>}>{widget ? <Widget /> : <Dashboard />}</Suspense>;
}
