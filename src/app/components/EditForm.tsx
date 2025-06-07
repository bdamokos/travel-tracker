'use client';

import { useState, useEffect } from 'react';
import { JourneyDay, Location, Transportation, InstagramPost } from '../types';
import { 
  geocodeLocation, 
  reverseGeocode,
  calculateDistance,
  estimateTravelTime,
  formatTravelTime,
  getRoutePath
} from '../services/geocoding';

interface EditFormProps {
  day?: JourneyDay;
  onSave: (data: Partial<JourneyDay>) => void;
  onCancel: () => void;
}

const EditForm: React.FC<EditFormProps> = ({ day, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<JourneyDay>>(
    day || {
      date: new Date().toISOString().split('T')[0],
      title: '',
      locations: [],
      customNotes: '',
    }
  );
  
  const [newLocation, setNewLocation] = useState<Partial<Location>>({
    name: '',
    coordinates: [0, 0],
    arrivalTime: '',
    notes: '',
  });
  
  const [newTransportation, setNewTransportation] = useState<Partial<Transportation>>({
    type: 'other',
    from: '',
    to: '',
    fromCoordinates: [0, 0],
    toCoordinates: [0, 0],
    distance: undefined,
    departureTime: '',
    arrivalTime: '',
  });
  
  const [newPost, setNewPost] = useState<Partial<InstagramPost>>({
    url: '',
    offline: false,
  });
  
  const [activeTab, setActiveTab] = useState<'basic' | 'location' | 'transport' | 'instagram'>('basic');
  const [geoLocationStatus, setGeoLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [geoLocationError, setGeoLocationError] = useState<string>('');
  
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [geocodeError, setGeocodeError] = useState<string>('');
  
  // Check if geolocation is available
  const isGeolocationAvailable = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewLocation(prev => ({ ...prev, [name]: value }));
  };
  
  const handleLocationCoordinatesChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = parseFloat(e.target.value);
    const newCoordinates = [...(newLocation.coordinates || [0, 0])];
    newCoordinates[index] = value;
    setNewLocation(prev => ({ ...prev, coordinates: newCoordinates as [number, number] }));
  };
  
  const handleTransportationChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewTransportation(prev => ({ ...prev, [name]: value }));
  };
  
  const handleTransportationCoordinatesChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'fromCoordinates' | 'toCoordinates',
    index: number
  ) => {
    const value = parseFloat(e.target.value);
    const newCoordinates = [...(newTransportation[field] || [0, 0])];
    newCoordinates[index] = value;
    setNewTransportation(prev => ({ ...prev, [field]: newCoordinates as [number, number] }));
  };
  
  const handlePostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setNewPost(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };
  
  // Handle location name geocoding
  const handleLocationNameSearch = async () => {
    if (!newLocation.name) {
      setGeocodeError('Please enter a location name');
      setGeocodeStatus('error');
      return;
    }
    
    setGeocodeStatus('loading');
    setGeocodeError('');
    
    try {
      const coordinates = await geocodeLocation(newLocation.name);
      
      if (!coordinates) {
        setGeocodeError('Could not find coordinates for this location');
        setGeocodeStatus('error');
        return;
      }
      
      setNewLocation(prev => ({
        ...prev,
        coordinates: coordinates
      }));
      
      setGeocodeStatus('success');
    } catch (error) {
      setGeocodeError('Error finding location coordinates');
      setGeocodeStatus('error');
      console.error('Geocoding error:', error);
    }
  };
  
  // Handle transportation location geocoding
  const handleTransportLocationSearch = async (type: 'from' | 'to') => {
    const locationName = type === 'from' ? newTransportation.from : newTransportation.to;
    
    if (!locationName) {
      setGeocodeError(`Please enter a ${type} location name`);
      setGeocodeStatus('error');
      return;
    }
    
    setGeocodeStatus('loading');
    setGeocodeError('');
    
    try {
      const coordinates = await geocodeLocation(locationName);
      
      if (!coordinates) {
        setGeocodeError(`Could not find coordinates for ${type} location`);
        setGeocodeStatus('error');
        return;
      }
      
      if (type === 'from') {
        setNewTransportation(prev => ({
          ...prev,
          fromCoordinates: coordinates
        }));
      } else {
        setNewTransportation(prev => ({
          ...prev,
          toCoordinates: coordinates
        }));
      }
      
      setGeocodeStatus('success');
      
      // If both locations have coordinates, calculate route info
      if (
        type === 'to' && 
        newTransportation.fromCoordinates &&
        newTransportation.fromCoordinates[0] !== 0
      ) {
        calculateRouteInfo();
      } else if (
        type === 'from' && 
        newTransportation.toCoordinates &&
        newTransportation.toCoordinates[0] !== 0
      ) {
        calculateRouteInfo();
      }
    } catch (error) {
      setGeocodeError(`Error finding ${type} location coordinates`);
      setGeocodeStatus('error');
      console.error('Geocoding error:', error);
    }
  };
  
  // Calculate route distance and travel time
  const calculateRouteInfo = async () => {
    if (
      !newTransportation.fromCoordinates ||
      !newTransportation.toCoordinates ||
      !newTransportation.type
    ) {
      return;
    }
    
    setIsCalculatingRoute(true);
    
    try {
      // Calculate great circle distance
      const distance = calculateDistance(
        newTransportation.fromCoordinates as [number, number],
        newTransportation.toCoordinates as [number, number]
      );
      
      // Estimate travel time
      const travelTimeMinutes = estimateTravelTime(
        distance,
        newTransportation.type as any
      );
      
      // Set default times if none are set
      const now = new Date();
      let departureTime = newTransportation.departureTime || 
                         `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      // Calculate arrival time based on departure time and estimated travel time
      let arrivalTime = '';
      if (departureTime) {
        const [hours, minutes] = departureTime.split(':').map(Number);
        const arrivalDate = new Date();
        arrivalDate.setHours(hours, minutes + travelTimeMinutes);
        arrivalTime = `${arrivalDate.getHours().toString().padStart(2, '0')}:${arrivalDate.getMinutes().toString().padStart(2, '0')}`;
      }
      
      setNewTransportation(prev => ({
        ...prev,
        distance: distance,
        departureTime: departureTime,
        arrivalTime: arrivalTime
      }));
    } catch (error) {
      console.error('Error calculating route information:', error);
    } finally {
      setIsCalculatingRoute(false);
    }
  };
  
  // Get current location (modified to use our reverseGeocode function)
  const getCurrentLocation = (target: 'location' | 'transportFrom' | 'transportTo') => {
    if (!isGeolocationAvailable) {
      setGeoLocationError('Geolocation is not supported by your browser');
      setGeoLocationStatus('error');
      return;
    }
    
    setGeoLocationStatus('loading');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        if (target === 'location') {
          setNewLocation(prev => ({
            ...prev,
            coordinates: [latitude, longitude]
          }));
        } else if (target === 'transportFrom') {
          setNewTransportation(prev => ({
            ...prev,
            fromCoordinates: [latitude, longitude]
          }));
        } else if (target === 'transportTo') {
          setNewTransportation(prev => ({
            ...prev,
            toCoordinates: [latitude, longitude]
          }));
        }
        
        setGeoLocationStatus('success');
        
        // Try to get the location name using reverse geocoding
        try {
          const locationName = await reverseGeocode(latitude, longitude);
          
          if (locationName) {
            if (target === 'location') {
              setNewLocation(prev => ({
                ...prev,
                name: locationName.split(',')[0] || `Location at ${latitude}, ${longitude}`
              }));
            } else if (target === 'transportFrom') {
              setNewTransportation(prev => ({
                ...prev,
                from: locationName.split(',')[0] || `Location at ${latitude}, ${longitude}`
              }));
            } else if (target === 'transportTo') {
              setNewTransportation(prev => ({
                ...prev,
                to: locationName.split(',')[0] || `Location at ${latitude}, ${longitude}`
              }));
            }
          }
        } catch (error) {
          console.error('Error with reverse geocoding:', error);
        }
      },
      (error) => {
        let errorMessage = 'Failed to get your location';
        
        if (error.code === 1) {
          errorMessage = 'Permission denied. Please allow location access.';
        } else if (error.code === 2) {
          errorMessage = 'Location information is unavailable.';
        } else if (error.code === 3) {
          errorMessage = 'The request to get location timed out.';
        }
        
        setGeoLocationError(errorMessage);
        setGeoLocationStatus('error');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };
  
  const addLocation = () => {
    if (!newLocation.name) return;
    
    setFormData(prev => ({
      ...prev,
      locations: [...(prev.locations || []), { 
        id: `temp-${Date.now()}`,
        name: newLocation.name,
        coordinates: newLocation.coordinates || [0, 0],
        arrivalTime: newLocation.arrivalTime,
        notes: newLocation.notes,
      }]
    }));
    
    // Reset the form
    setNewLocation({
      name: '',
      coordinates: [0, 0],
      arrivalTime: '',
      notes: '',
    });
  };
  
  const addTransportation = () => {
    if (!newTransportation.from || !newTransportation.to) return;
    
    setFormData(prev => ({
      ...prev,
      transportation: {
        id: `temp-${Date.now()}`,
        type: newTransportation.type || 'other',
        from: newTransportation.from,
        to: newTransportation.to,
        fromCoordinates: newTransportation.fromCoordinates || [0, 0],
        toCoordinates: newTransportation.toCoordinates || [0, 0],
        distance: newTransportation.distance,
        departureTime: newTransportation.departureTime,
        arrivalTime: newTransportation.arrivalTime,
      }
    }));
    
    // Reset the form
    setNewTransportation({
      type: 'other',
      from: '',
      to: '',
      fromCoordinates: [0, 0],
      toCoordinates: [0, 0],
      distance: undefined,
      departureTime: '',
      arrivalTime: '',
    });
  };
  
  const addInstagramPost = () => {
    if (!newPost.url) return;
    
    setFormData(prev => ({
      ...prev,
      instagramPosts: [...(prev.instagramPosts || []), {
        id: `temp-${Date.now()}`,
        url: newPost.url,
        offline: newPost.offline || false,
      }]
    }));
    
    // Reset the form
    setNewPost({
      url: '',
      offline: false,
    });
  };
  
  const removeLocation = (index: number) => {
    setFormData(prev => ({
      ...prev,
      locations: prev.locations?.filter((_, i) => i !== index),
    }));
  };
  
  const removeTransportation = () => {
    setFormData(prev => ({
      ...prev,
      transportation: undefined,
    }));
  };
  
  const removeInstagramPost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      instagramPosts: prev.instagramPosts?.filter((_, i) => i !== index),
    }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold">{day ? 'Edit Travel Period' : 'Add New Travel Period'}</h2>
      
      <div className="mt-4 border-b">
        <div className="flex space-x-4 mb-2">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`pb-2 px-1 ${
              activeTab === 'basic'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-500'
            }`}
          >
            Basic Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('location')}
            className={`pb-2 px-1 ${
              activeTab === 'location'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-500'
            }`}
          >
            Locations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transport')}
            className={`pb-2 px-1 ${
              activeTab === 'transport'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-500'
            }`}
          >
            Transportation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('instagram')}
            className={`pb-2 px-1 ${
              activeTab === 'instagram'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-500'
            }`}
          >
            Instagram
          </button>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="mt-4">
        {/* Basic Info Tab */}
        {activeTab === 'basic' && (
          <div>
            <div className="mb-4">
              <label htmlFor="title" className="block mb-1 font-medium">
                Title
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full p-2 border rounded"
                placeholder="Enter a title for this period"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="date" className="block mb-1 font-medium">
                  Start Date
                </label>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="endDate" className="block mb-1 font-medium">
                  End Date <span className="text-sm text-gray-500">(Optional)</span>
                </label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate || ''}
                  onChange={handleChange}
                  className="w-full p-2 border rounded"
                  min={formData.date} // Cannot be before start date
                />
                <p className="text-xs text-gray-500 mt-1">For multi-day periods</p>
              </div>
            </div>
            
            <div className="mb-4">
              <label htmlFor="customNotes" className="block mb-1 font-medium">
                Notes
              </label>
              <textarea
                id="customNotes"
                name="customNotes"
                value={formData.customNotes}
                onChange={handleChange}
                className="w-full p-2 border rounded h-32"
                placeholder="Any notes about this period..."
              />
            </div>
          </div>
        )}
        
        {/* Locations Tab */}
        {activeTab === 'location' && (
          <div>
            <div className="mb-4">
              <h3 className="font-medium mb-2">Add Location</h3>
              
              <div className="mb-3">
                <label htmlFor="locationName" className="block mb-1">
                  Location Name
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    id="locationName"
                    name="name"
                    value={newLocation.name}
                    onChange={handleLocationChange}
                    className="flex-1 p-2 border rounded"
                    placeholder="Enter location name"
                  />
                  <button
                    type="button"
                    className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600"
                    onClick={handleLocationNameSearch}
                    disabled={geocodeStatus === 'loading'}
                  >
                    {geocodeStatus === 'loading' ? 'Searching...' : 'Find'}
                  </button>
                  {isGeolocationAvailable && (
                    <button
                      type="button"
                      className="bg-gray-200 text-gray-800 px-3 py-2 rounded hover:bg-gray-300"
                      onClick={() => getCurrentLocation('location')}
                      disabled={geoLocationStatus === 'loading'}
                    >
                      {geoLocationStatus === 'loading' ? 'Getting...' : '📍'}
                    </button>
                  )}
                </div>
                {geocodeStatus === 'error' && (
                  <p className="text-red-500 text-sm mt-1">{geocodeError}</p>
                )}
                {geoLocationStatus === 'error' && (
                  <p className="text-red-500 text-sm mt-1">{geoLocationError}</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="locationLat" className="block mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    id="locationLat"
                    value={newLocation.coordinates?.[0] || 0}
                    onChange={(e) => handleLocationCoordinatesChange(e, 0)}
                    className="w-full p-2 border rounded"
                    step="0.000001"
                  />
                </div>
                <div>
                  <label htmlFor="locationLng" className="block mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    id="locationLng"
                    value={newLocation.coordinates?.[1] || 0}
                    onChange={(e) => handleLocationCoordinatesChange(e, 1)}
                    className="w-full p-2 border rounded"
                    step="0.000001"
                  />
                </div>
              </div>
              
              <div className="mb-3">
                <label htmlFor="locationArrivalTime" className="block mb-1">
                  Arrival Time (optional)
                </label>
                <input
                  type="time"
                  id="locationArrivalTime"
                  name="arrivalTime"
                  value={newLocation.arrivalTime || ''}
                  onChange={handleLocationChange}
                  className="w-full p-2 border rounded"
                />
              </div>
              
              <div className="mb-3">
                <label htmlFor="locationNotes" className="block mb-1">
                  Notes (optional)
                </label>
                <textarea
                  id="locationNotes"
                  name="notes"
                  value={newLocation.notes || ''}
                  onChange={handleLocationChange}
                  className="w-full p-2 border rounded h-20"
                  placeholder="Any notes about this location..."
                />
              </div>
              
              <button
                type="button"
                onClick={addLocation}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Add Location
              </button>
            </div>
            
            {formData.locations && formData.locations.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Added Locations</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {formData.locations.map((location, index) => (
                    <div key={location.id || index} className="border p-3 rounded">
                      <div className="flex justify-between">
                        <h4 className="font-medium">{location.name}</h4>
                        <button
                          type="button"
                          onClick={() => removeLocation(index)}
                          className="text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-sm text-gray-600">
                        Coordinates: {location.coordinates[0]}, {location.coordinates[1]}
                      </p>
                      {location.arrivalTime && (
                        <p className="text-sm text-gray-600">
                          Arrival: {location.arrivalTime}
                        </p>
                      )}
                      {location.notes && (
                        <p className="text-sm mt-1">{location.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Transportation Tab */}
        {activeTab === 'transport' && (
          <div>
            <div className="mb-4">
              <h3 className="font-medium mb-2">Add Transportation</h3>
              
              <div className="mb-3">
                <label htmlFor="transportType" className="block mb-1">
                  Transportation Type
                </label>
                <select
                  id="transportType"
                  name="type"
                  value={newTransportation.type}
                  onChange={handleTransportationChange}
                  className="w-full p-2 border rounded"
                >
                  <option value="walk">Walking</option>
                  <option value="bike">Biking</option>
                  <option value="car">Car</option>
                  <option value="bus">Bus</option>
                  <option value="train">Train</option>
                  <option value="plane">Plane</option>
                  <option value="ferry">Ferry</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div className="mb-3">
                <label htmlFor="transportFrom" className="block mb-1">
                  From
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    id="transportFrom"
                    name="from"
                    value={newTransportation.from}
                    onChange={handleTransportationChange}
                    className="flex-1 p-2 border rounded"
                    placeholder="Starting location"
                  />
                  <button
                    type="button"
                    className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600"
                    onClick={() => handleTransportLocationSearch('from')}
                    disabled={geocodeStatus === 'loading'}
                  >
                    {geocodeStatus === 'loading' ? 'Searching...' : 'Find'}
                  </button>
                  {isGeolocationAvailable && (
                    <button
                      type="button"
                      className="bg-gray-200 text-gray-800 px-3 py-2 rounded hover:bg-gray-300"
                      onClick={() => getCurrentLocation('transportFrom')}
                      disabled={geoLocationStatus === 'loading'}
                    >
                      {geoLocationStatus === 'loading' ? '...' : '📍'}
                    </button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="fromLat" className="block mb-1">
                    From Latitude
                  </label>
                  <input
                    type="number"
                    id="fromLat"
                    value={newTransportation.fromCoordinates?.[0] || 0}
                    onChange={(e) => handleTransportationCoordinatesChange(e, 'fromCoordinates', 0)}
                    className="w-full p-2 border rounded"
                    step="0.000001"
                  />
                </div>
                <div>
                  <label htmlFor="fromLng" className="block mb-1">
                    From Longitude
                  </label>
                  <input
                    type="number"
                    id="fromLng"
                    value={newTransportation.fromCoordinates?.[1] || 0}
                    onChange={(e) => handleTransportationCoordinatesChange(e, 'fromCoordinates', 1)}
                    className="w-full p-2 border rounded"
                    step="0.000001"
                  />
                </div>
              </div>
              
              <div className="mb-3">
                <label htmlFor="transportTo" className="block mb-1">
                  To
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    id="transportTo"
                    name="to"
                    value={newTransportation.to}
                    onChange={handleTransportationChange}
                    className="flex-1 p-2 border rounded"
                    placeholder="Destination"
                  />
                  <button
                    type="button"
                    className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600"
                    onClick={() => handleTransportLocationSearch('to')}
                    disabled={geocodeStatus === 'loading'}
                  >
                    {geocodeStatus === 'loading' ? 'Searching...' : 'Find'}
                  </button>
                  {isGeolocationAvailable && (
                    <button
                      type="button"
                      className="bg-gray-200 text-gray-800 px-3 py-2 rounded hover:bg-gray-300"
                      onClick={() => getCurrentLocation('transportTo')}
                      disabled={geoLocationStatus === 'loading'}
                    >
                      {geoLocationStatus === 'loading' ? '...' : '📍'}
                    </button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="toLat" className="block mb-1">
                    To Latitude
                  </label>
                  <input
                    type="number"
                    id="toLat"
                    value={newTransportation.toCoordinates?.[0] || 0}
                    onChange={(e) => handleTransportationCoordinatesChange(e, 'toCoordinates', 0)}
                    className="w-full p-2 border rounded"
                    step="0.000001"
                  />
                </div>
                <div>
                  <label htmlFor="toLng" className="block mb-1">
                    To Longitude
                  </label>
                  <input
                    type="number"
                    id="toLng"
                    value={newTransportation.toCoordinates?.[1] || 0}
                    onChange={(e) => handleTransportationCoordinatesChange(e, 'toCoordinates', 1)}
                    className="w-full p-2 border rounded"
                    step="0.000001"
                  />
                </div>
              </div>
              
              <button
                type="button"
                onClick={calculateRouteInfo}
                className="mb-3 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
                disabled={
                  isCalculatingRoute || 
                  !newTransportation.fromCoordinates || 
                  !newTransportation.toCoordinates
                }
              >
                {isCalculatingRoute ? 'Calculating...' : 'Calculate Route Info'}
              </button>
              
              {newTransportation.distance && (
                <div className="p-3 mb-3 bg-blue-50 rounded text-blue-800">
                  <p>Distance: {newTransportation.distance} km</p>
                  <p>Estimated travel time: {formatTravelTime(estimateTravelTime(
                    newTransportation.distance,
                    newTransportation.type as any
                  ))}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="departureTime" className="block mb-1">
                    Departure Time
                  </label>
                  <input
                    type="time"
                    id="departureTime"
                    name="departureTime"
                    value={newTransportation.departureTime || ''}
                    onChange={handleTransportationChange}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label htmlFor="arrivalTime" className="block mb-1">
                    Arrival Time
                  </label>
                  <input
                    type="time"
                    id="arrivalTime"
                    name="arrivalTime"
                    value={newTransportation.arrivalTime || ''}
                    onChange={handleTransportationChange}
                    className="w-full p-2 border rounded"
                  />
                </div>
              </div>
              
              <button
                type="button"
                onClick={addTransportation}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Add Transportation
              </button>
            </div>
            
            {formData.transportation && (
              <div>
                <h3 className="font-medium mb-2">Added Transportation</h3>
                <div className="border p-3 rounded">
                  <div className="flex justify-between">
                    <h4 className="font-medium capitalize">
                      {formData.transportation.type} 
                    </h4>
                    <button
                      type="button"
                      onClick={removeTransportation}
                      className="text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-sm">
                    From: {formData.transportation.from} to {formData.transportation.to}
                  </p>
                  {formData.transportation.distance && (
                    <p className="text-sm text-gray-600">
                      Distance: {formData.transportation.distance} km
                    </p>
                  )}
                  {(formData.transportation.departureTime || formData.transportation.arrivalTime) && (
                    <p className="text-sm text-gray-600">
                      {formData.transportation.departureTime && (
                        <>Departure: {formData.transportation.departureTime} </>
                      )}
                      {formData.transportation.arrivalTime && (
                        <>Arrival: {formData.transportation.arrivalTime}</>
                      )}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Instagram Tab */}
        {activeTab === 'instagram' && (
          <div>
            <div className="mb-4">
              <h3 className="font-medium mb-2">Add Instagram Post</h3>
              
              <div className="mb-3">
                <label htmlFor="instagramUrl" className="block mb-1">
                  Instagram Post URL
                </label>
                <input
                  type="url"
                  id="instagramUrl"
                  name="url"
                  value={newPost.url}
                  onChange={handlePostChange}
                  className="w-full p-2 border rounded"
                  placeholder="https://www.instagram.com/p/..."
                />
              </div>
              
              <div className="mb-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="offline"
                    checked={newPost.offline}
                    onChange={handlePostChange}
                    className="mr-2"
                  />
                  Save as offline (will be uploaded later)
                </label>
              </div>
              
              <button
                type="button"
                onClick={addInstagramPost}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Add Instagram Post
              </button>
            </div>
            
            {formData.instagramPosts && formData.instagramPosts.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Added Instagram Posts</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {formData.instagramPosts.map((post, index) => (
                    <div key={post.id || index} className="border p-3 rounded">
                      <div className="flex justify-between">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          {post.url}
                        </a>
                        <button
                          type="button"
                          onClick={() => removeInstagramPost(index)}
                          className="text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                      {post.offline && (
                        <p className="text-sm text-amber-600 mt-1">
                          Will be uploaded when online
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border rounded"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditForm; 