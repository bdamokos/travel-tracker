'use client';

import { useEffect } from 'react';

/**
 * Component that ensures all iframes on the page have proper accessibility attributes.
 * This is particularly useful for third-party injected iframes (like Cloudflare Analytics)
 * that may not include proper WCAG-compliant attributes.
 *
 * The component addresses WCAG 2.4.1 requirements by:
 * - Adding descriptive title attributes to iframes that lack them
 * - Setting aria-hidden="true" only for permanently hidden tracking iframes (1x1 pixels)
 * - Using MutationObserver to detect dynamically injected iframes
 *
 * @returns {null} This component doesn't render any visible content
 */
export default function IframeAccessibilityFixer() {
  useEffect(() => {
    /**
     * Checks if an iframe is a permanently hidden tracking pixel.
     * Only 1x1 pixel iframes with absolute positioning are considered tracking pixels.
     * This avoids incorrectly flagging conditionally-visible iframes (like modals).
     *
     * @param {HTMLIFrameElement} iframe - The iframe element to check
     * @returns {boolean} True if the iframe is a tracking pixel
     */
    const isTrackingPixel = (iframe: HTMLIFrameElement): boolean => {
      const styles = window.getComputedStyle(iframe);
      return (
        (iframe.width === '1' && iframe.height === '1') ||
        (iframe.offsetWidth === 1 && iframe.offsetHeight === 1)
      ) && styles.position === 'absolute';
    };

    /**
     * Fixes accessibility attributes for a single iframe.
     * Adds title attribute if missing and aria-hidden for tracking pixels.
     *
     * @param {HTMLIFrameElement} iframe - The iframe element to fix
     */
    const fixSingleIframe = (iframe: HTMLIFrameElement): void => {
      const needsTitle = !iframe.hasAttribute('title') || iframe.getAttribute('title')?.trim() === '';
      const isTracking = isTrackingPixel(iframe);

      if (needsTitle) {
        if (isTracking) {
          // For tracking pixels, add descriptive title and hide from screen readers
          iframe.setAttribute('title', 'Analytics and tracking frame');
          iframe.setAttribute('aria-hidden', 'true');
        } else {
          // For visible/other iframes, only add title (don't hide from screen readers)
          iframe.setAttribute('title', 'Embedded content');
        }
      } else if (isTracking && iframe.getAttribute('aria-hidden') !== 'true') {
        // If iframe already has a title but is a tracking pixel, ensure aria-hidden is set
        // This overrides any existing aria-hidden="false" values
        iframe.setAttribute('aria-hidden', 'true');
      }
    };

    /**
     * Scans all iframes on the page and fixes accessibility attributes.
     */
    const fixIframeAccessibility = (): void => {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(fixSingleIframe);
    };

    // Debounce timer for MutationObserver
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Handles DOM mutations and triggers iframe accessibility fixes.
     * Debounced to prevent excessive calls when multiple iframes are added rapidly.
     *
     * @param {MutationRecord[]} mutations - Array of DOM mutations
     */
    const handleMutations = (mutations: MutationRecord[]): void => {
      // Use Array.some() to exit early when we find an iframe
      const hasNewIframes = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) => {
          if (node instanceof HTMLElement) {
            return node.tagName === 'IFRAME' || node.querySelector('iframe') !== null;
          }
          return false;
        })
      );

      if (hasNewIframes) {
        // Debounce to avoid excessive calls when multiple iframes are added
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(fixIframeAccessibility, 100);
      }
    };

    // Run immediately after component mounts
    fixIframeAccessibility();

    // Set up a MutationObserver to catch iframes added dynamically
    const observer = new MutationObserver(handleMutations);

    // Start observing the document for added iframes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Cleanup
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      observer.disconnect();
    };
  }, []);

  // This component doesn't render anything
  return null;
}
