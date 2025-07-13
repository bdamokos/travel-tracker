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

// Make fetch available in Node.js test environment for integration tests
if (process.env.JEST_INTEGRATION_TESTS && typeof global.fetch === 'undefined') {
  // In Node.js 18+, fetch is available in globalThis
  global.fetch = globalThis.fetch
  global.Headers = globalThis.Headers
  global.Request = globalThis.Request
  global.Response = globalThis.Response
}

// // Global fetch mock for API calls - only mock fetch if explicitly requested
// if (process.env.JEST_MOCK_FETCH) {
//   global.fetch = jest.fn()
// }

beforeEach(() => {
  // Reset all mocks before each test (but only if we're using mocks)
  if (!process.env.JEST_INTEGRATION_TESTS) {
    jest.clearAllMocks()
  }
})