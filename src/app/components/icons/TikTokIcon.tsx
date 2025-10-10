import { HTMLAttributes, useId } from 'react';

const BASE_CONTAINER_CLASSES =
  'inline-flex items-center justify-center rounded-lg bg-black text-white ring-1 ring-white/10 shadow-sm';

const SVG_PATH_D =
  'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z';

interface TikTokIconProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * Classes applied to the container element. Defaults to a square badge similar to Instagram.
   */
  containerClassName?: string;
  /**
   * Classes applied to the SVG glyph.
   */
  iconClassName?: string;
  /**
   * Accessible label for screen readers. If omitted, the icon is hidden from assistive tech.
   */
  ariaLabel?: string;
}

export default function TikTokIcon({
  containerClassName = 'w-8 h-8',
  iconClassName = 'w-4 h-4',
  ariaLabel,
  className,
  ...rest
}: TikTokIconProps) {
  const gradientId = `${useId()}-tiktok`;

  const combinedContainerClassName = [
    BASE_CONTAINER_CLASSES,
    containerClassName,
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={combinedContainerClassName}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      {...rest}
    >
      <svg
        className={iconClassName}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#25F4EE" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#FE2C55" />
          </linearGradient>
        </defs>
        <path d={SVG_PATH_D} fill={`url(#${gradientId})`} />
      </svg>
    </span>
  );
}

interface TikTokIconMarkupOptions {
  containerClassName?: string;
  iconClassName?: string;
  className?: string;
  ariaLabel?: string;
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const getTikTokIconMarkup = ({
  containerClassName = 'w-8 h-8',
  iconClassName = 'w-4 h-4',
  className,
  ariaLabel,
}: TikTokIconMarkupOptions = {}) => {
  const combinedContainerClassName = [BASE_CONTAINER_CLASSES, containerClassName, className]
    .filter(Boolean)
    .join(' ')
    .trim();

  const roleAttribute = ariaLabel ? ' role="img"' : '';
  const accessibilityAttribute = ariaLabel
    ? ` aria-label="${escapeAttribute(ariaLabel)}"`
    : ' aria-hidden="true"';

  const gradientId = `tiktok-gradient-${Math.random().toString(36).slice(2, 10)}`;
  const spanStart = `<span class="${combinedContainerClassName}"${roleAttribute}${accessibilityAttribute}>`;
  const svgMarkup = `
<svg class="${iconClassName}" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#25F4EE" />
      <stop offset="50%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#FE2C55" />
    </linearGradient>
  </defs>
  <path d="${SVG_PATH_D}" fill="url(#${gradientId})" />
</svg>
`.trim();

  return `${spanStart}${svgMarkup}</span>`;
};
