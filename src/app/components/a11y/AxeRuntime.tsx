'use client';

import { useEffect } from 'react';

export default function AxeRuntime() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    void (async () => {
      const axeModule = await import('@axe-core/react');
      const reactModule = await import('react');
      const reactDomModule = await import('react-dom');

      const axe = 'default' in axeModule ? axeModule.default : axeModule;
      const React = 'default' in reactModule ? reactModule.default : reactModule;
      const ReactDOM = 'default' in reactDomModule ? reactDomModule.default : reactDomModule;

      try {
        axe(React, ReactDOM, 1000);
      } catch {
        // Runtime a11y checks should never crash the app in development.
      }
    })();
  }, []);

  return null;
}

