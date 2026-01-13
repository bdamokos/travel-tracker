'use client';

import { useEffect } from 'react';

/**
 * Component that ensures all iframes on the page have proper accessibility attributes.
 * This is particularly useful for third-party injected iframes (like Cloudflare Analytics)
 * that may not include proper WCAG-compliant attributes.
 */
export default function IframeAccessibilityFixer() {
  useEffect(() => {
    const fixIframeAccessibility = () => {
      // Find all iframes in the document
      const iframes = document.querySelectorAll('iframe');

      iframes.forEach((iframe) => {
        // Check if iframe is hidden (common for analytics/tracking)
        const isHidden =
          iframe.style.visibility === 'hidden' ||
          iframe.style.display === 'none' ||
          iframe.getAttribute('hidden') !== null ||
          (iframe.offsetWidth === 0 && iframe.offsetHeight === 0) ||
          (iframe.width === '1' && iframe.height === '1');

        // If iframe lacks a title attribute
        if (!iframe.hasAttribute('title') || iframe.getAttribute('title')?.trim() === '') {
          if (isHidden) {
            // For hidden iframes (analytics/tracking), add descriptive title
            iframe.setAttribute('title', 'Analytics and tracking frame');
            // Also add aria-hidden since it's not visible to users
            iframe.setAttribute('aria-hidden', 'true');
          } else {
            // For visible iframes without titles, add a generic but descriptive title
            iframe.setAttribute('title', 'Embedded content');
          }
        }

        // If iframe is hidden but doesn't have aria-hidden
        if (isHidden && !iframe.hasAttribute('aria-hidden')) {
          iframe.setAttribute('aria-hidden', 'true');
        }
      });
    };

    // Run immediately after component mounts
    fixIframeAccessibility();

    // Run again after a short delay to catch asynchronously injected iframes
    const timeoutId = setTimeout(fixIframeAccessibility, 1000);

    // Set up a MutationObserver to catch iframes added dynamically
    const observer = new MutationObserver((mutations) => {
      let shouldFix = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          // Check if the added node is an iframe or contains iframes
          if (node instanceof HTMLElement) {
            if (node.tagName === 'IFRAME' || node.querySelector('iframe')) {
              shouldFix = true;
            }
          }
        });
      });

      if (shouldFix) {
        fixIframeAccessibility();
      }
    });

    // Start observing the document for added iframes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, []);

  // This component doesn't render anything
  return null;
}
