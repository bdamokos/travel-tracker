import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import ErrorBoundary from './components/ErrorBoundary';

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
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className={inter.className}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        
        {/* Service Worker Registration Script */}
        <Script id="service-worker-registration" strategy="afterInteractive">
          {"if ('serviceWorker' in navigator) {" +
           "window.addEventListener('load', function() {" +
           "navigator.serviceWorker.register('/sw.js').then(" +
           "function(registration) {" +
           "console.log('Service Worker registration successful with scope: ', registration.scope);" +
           "}," +
           "function(err) {" +
           "console.log('Service Worker registration failed: ', err);" +
           "}" +
           ");" +
           "});" +
           "}"}
        </Script>
      </body>
    </html>
  );
} 