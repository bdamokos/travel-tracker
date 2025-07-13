import '@testing-library/jest-dom'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      prefetch: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return ''
  },
}))

// Mock Leaflet since it doesn't work in JSDOM
jest.mock('leaflet', () => ({
  map: jest.fn(() => ({
    setView: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    remove: jest.fn(),
  })),
  tileLayer: jest.fn(() => ({
    addTo: jest.fn(),
  })),
  marker: jest.fn(() => ({
    addTo: jest.fn(),
    bindPopup: jest.fn(),
  })),
  polyline: jest.fn(() => ({
    addTo: jest.fn(),
  })),
  latLngBounds: jest.fn(),
  latLng: jest.fn(),
  divIcon: jest.fn(),
  Icon: {
    Default: {
      prototype: {},
      mergeOptions: jest.fn(),
    },
  },
}))

// Mock react-leaflet
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: () => <div data-testid="marker" />,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  Polyline: () => <div data-testid="polyline" />,
}))

// Global fetch mock for API calls - but allow real fetch for integration tests
// Only mock fetch if not in integration test environment
if (!process.env.JEST_INTEGRATION_TESTS) {
  global.fetch = jest.fn()
}

beforeEach(() => {
  // Reset all mocks before each test (but only if we're using mocks)
  if (!process.env.JEST_INTEGRATION_TESTS) {
    jest.clearAllMocks()
  }
})