import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ErrorBoundary from './components/ErrorBoundary';
import IframeAccessibilityFixer from './components/IframeAccessibilityFixer';
import OfflineDeltaBanner from './components/OfflineDeltaBanner';
import OfflineReadyToast from './components/OfflineReadyToast';
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Travel Tracker - Map your journey',
      description: 'A tool to visualize and track your travel journeys with interactive maps and timelines.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className={inter.className}>
        <IframeAccessibilityFixer />
        <ServiceWorkerRegistration />
        <OfflineDeltaBanner />
        <OfflineReadyToast />
        <main>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </body>
    </html>
  );
} 
