import { redirect } from 'next/navigation';

export default function CalendarsPage() {
  // For now, redirect to the main page since we need a specific trip ID
  // In the future, this could show a list of all public trip calendars
  redirect('/');
}