'use client';

interface StatusAnnouncerProps {
  id?: string;
  announcement: string;
  ariaLive?: 'polite' | 'assertive' | 'off';
  role?: 'status' | 'alert';
  atomic?: boolean;
}

export default function StatusAnnouncer({
  id,
  announcement,
  ariaLive = 'polite',
  role = 'status',
  atomic = true,
}: StatusAnnouncerProps) {
  return (
    <div id={id} className="sr-only" role={role} aria-live={ariaLive} aria-atomic={atomic}>
      {announcement}
    </div>
  );
}
