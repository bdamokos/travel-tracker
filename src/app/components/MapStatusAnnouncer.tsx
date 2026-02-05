'use client';

import StatusAnnouncer from '@/app/components/a11y/StatusAnnouncer';

interface MapStatusAnnouncerProps {
  id?: string;
  announcement: string;
}

export default function MapStatusAnnouncer({ id, announcement }: MapStatusAnnouncerProps) {
  return <StatusAnnouncer id={id} announcement={announcement} ariaLive="polite" role="status" atomic />;
}
