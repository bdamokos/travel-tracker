import type { HTMLAttributes } from 'react';

interface InstagramIconProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * Classes applied to the gradient container. Defaults to a square badge that matches existing designs.
   */
  containerClassName?: string;
  /**
   * Classes applied to the glyph inside the gradient container.
   */
  iconClassName?: string;
  /**
   * Accessible label for screen readers. When omitted the icon is hidden from assistive tech.
   */
  ariaLabel?: string;
}

export default function InstagramIcon({
  containerClassName = 'w-8 h-8',
  iconClassName = 'w-4 h-4',
  ariaLabel,
  className,
  ...rest
}: InstagramIconProps) {
  const combinedContainerClassName = [
    'inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500',
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
        className={`text-white ${iconClassName}`}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92C2.163 15.584 2.15 15.205 2.15 12c0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919C8.405 2.175 8.784 2.163 12 2.163zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98C0.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.667.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    </span>
  );
}
