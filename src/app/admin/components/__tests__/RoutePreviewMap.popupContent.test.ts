import { describe, expect, it } from '@jest/globals';
import { createRoutePreviewPopupContent } from '@/app/admin/components/RoutePreviewMap';

describe('createRoutePreviewPopupContent', () => {
  it('renders normal route popup labels and coordinates', () => {
    const popupContent = createRoutePreviewPopupContent('End', 'Brussels', [50.8503, 4.3517]);

    expect(popupContent.querySelector('strong')?.textContent).toBe('End: Brussels');
    expect(popupContent.querySelector('small')?.textContent).toBe('50.8503, 4.3517');
  });

  it('treats route endpoint names as text, not popup HTML', () => {
    const maliciousName = 'Paris <img src=x onerror="alert(1)"><script>alert(2)</script>';

    const popupContent = createRoutePreviewPopupContent('Start', maliciousName, [48.8566, 2.3522]);

    expect(popupContent.querySelector('img')).toBeNull();
    expect(popupContent.querySelector('script')).toBeNull();
    expect(popupContent.textContent).toContain(`Start: ${maliciousName}`);
    expect(popupContent.innerHTML).not.toContain('<img');
    expect(popupContent.innerHTML).not.toContain('<script>');
  });
});
