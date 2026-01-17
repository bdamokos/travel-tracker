import '@testing-library/jest-dom'

// Some UI tests can be slow on busy CI machines.
jest.setTimeout(30_000)

// `pick-distinct-colors` ships ESM that Jest doesn't transpile by default; unit tests don't need real colors.
if (!process.env.JEST_INTEGRATION_TESTS) {
  jest.mock('pick-distinct-colors', () => ({
    pickDistinctColors: jest.fn(async ({ count }) => ({
      colors: Array.from({ length: count ?? 1 }, () => [0, 0, 0]),
    })),
  }))
}

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
const createMockPoint = (x, y) => ({
  x,
  y,
  distanceTo(other) {
    if (!other) return Number.POSITIVE_INFINITY
    return Math.hypot(this.x - other.x, this.y - other.y)
  },
})

const createMockMap = () => {
  const listeners = new Map()
  return {
    setView: jest.fn(),
    on: jest.fn((event, handler) => {
      const existing = listeners.get(event) ?? new Set()
      existing.add(handler)
      listeners.set(event, existing)
    }),
    off: jest.fn((event, handler) => {
      const existing = listeners.get(event)
      if (!existing) return
      existing.delete(handler)
      if (existing.size === 0) listeners.delete(event)
    }),
    remove: jest.fn(),
    fitBounds: jest.fn(),
    panBy: jest.fn(),
    getZoom: jest.fn(() => 5),
    getMaxZoom: jest.fn(() => 18),
    getMinZoom: jest.fn(() => 0),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    project: jest.fn(latLng => createMockPoint(latLng.lng * 100, latLng.lat * -100)),
    unproject: jest.fn(point => ({ lat: point.y / -100, lng: point.x / 100 })),
  }
}

const testLeafletMap = createMockMap()
globalThis.__TEST_LEAFLET_MAP__ = testLeafletMap

jest.mock('leaflet', () => {
  const leaflet = {
    map: jest.fn(() => testLeafletMap),
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
    latLngBounds: jest.fn(() => ({})),
    latLng: jest.fn((lat, lng) => ({ lat, lng })),
    point: jest.fn((x, y) => createMockPoint(x, y)),
    divIcon: jest.fn(options => ({ ...options, options })),
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: jest.fn(),
      },
    },
  }

  return {
    __esModule: true,
    default: leaflet,
    ...leaflet,
  }
})

// Mock react-leaflet
jest.mock('react-leaflet', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react')

  const getIconHtml = icon => icon?.options?.html ?? icon?.html ?? ''

  const MapContainer = React.forwardRef(function MockMapContainer({ children }, ref) {
    if (ref && typeof ref === 'object') {
      ref.current = globalThis.__TEST_LEAFLET_MAP__
    }

    return <div data-testid="map-container">{children}</div>
  })

  const useMap = () => globalThis.__TEST_LEAFLET_MAP__

  const TileLayer = () => null
  const Polyline = () => null

  const Marker = ({ icon, eventHandlers }) => {
    const wrapperRef = React.useRef(null)
    const handlersRef = React.useRef(eventHandlers)
    const markerTargetRef = React.useRef({ getElement: () => wrapperRef.current })
    const lastHtmlRef = React.useRef(null)

    React.useLayoutEffect(() => {
      handlersRef.current = eventHandlers
    }, [eventHandlers])

    React.useLayoutEffect(() => {
      const html = getIconHtml(icon)
      if (wrapperRef.current && lastHtmlRef.current !== html) {
        wrapperRef.current.innerHTML = html
        lastHtmlRef.current = html
      }
    }, [icon])

    React.useLayoutEffect(() => {
      handlersRef.current?.add?.({ target: markerTargetRef.current })
      return () => {
        handlersRef.current?.remove?.({ target: markerTargetRef.current })
      }
    }, [])

    return <div ref={wrapperRef} data-testid="marker" />
  }

  const Popup = ({ children }) => <div data-testid="popup">{children}</div>

  return {
    __esModule: true,
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    useMap,
  }
})

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

// JSDOM doesn't implement window.alert/confirm; stub them for components that use browser dialogs.
if (typeof window !== 'undefined') {
  window.alert = jest.fn()
  window.confirm = jest.fn(() => true)
}
