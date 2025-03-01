# Travel Tracker

A single-page web application that visualizes travel journeys on an OpenStreetMap (OSM) interface, allowing users to trace their routes through various transportation methods while displaying chronological travel notes and Instagram content alongside the map.

## Features

- Interactive OpenStreetMap display with route visualization
- Different route styles based on transportation type (air, land, sea)
- Chronological travel timeline
- Location markers with popup information
- Instagram post integration
- Responsive design for desktop and mobile
- **Offline-capable editing interface**
- **Local storage for offline data**
- **Background synchronization when online**

## Technologies Used

- Next.js with TypeScript
- Leaflet.js for map functionality
- IndexedDB for offline storage
- Service Workers for offline capabilities
- Tailwind CSS for styling

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/travel-tracker.git
cd travel-tracker
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Offline Capabilities

Travel Tracker is designed to work offline with the following capabilities:

- **Service Worker**: Caches app assets and map tiles for offline use
- **IndexedDB**: Stores journey data locally on your device
- **Sync Mechanism**: Automatically syncs changes when you're back online

## Usage

1. **Creating a Journey**: Click "Create New Journey" to start tracking your travels
2. **Adding Days**: Click "Add New Day" to add a new day to your journey
3. **Adding Locations**: In the edit form, go to the "Locations" tab to add places you've visited
4. **Adding Transportation**: Track how you moved between locations
5. **Adding Instagram Posts**: Link your Instagram posts to specific days in your journey

## Mobile App Installation

Travel Tracker is a Progressive Web App (PWA) that can be installed on your mobile device:

### iOS:
1. Open the website in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

### Android:
1. Open the website in Chrome
2. Tap the menu button
3. Select "Add to Home Screen" or "Install App"

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenStreetMap for map data
- Leaflet.js for map rendering capabilities
- Next.js team for the React framework 