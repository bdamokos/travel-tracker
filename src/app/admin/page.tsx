import { Metadata } from 'next';
import TravelDataForm from './components/TravelDataForm';

export const metadata: Metadata = {
  title: 'Travel Tracker Admin - Input Travel Data',
  description: 'Admin interface for inputting travel journey data',
};

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              Travel Tracker Admin
            </h1>
            <p className="text-gray-600">
              Input your travel data to generate embeddable travel maps for your blog.
            </p>
          </header>
          
          <div className="bg-white rounded-lg shadow-lg p-6">
            <TravelDataForm />
          </div>
        </div>
      </div>
    </div>
  );
} 