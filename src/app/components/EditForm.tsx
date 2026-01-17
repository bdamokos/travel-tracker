'use client';

import { useState } from 'react';
import { JourneyDay, Location, Transportation, InstagramPost, BlogPost, TikTokPost } from '@/app/types';
import AccessibleDatePicker from '@/app/admin/components/AccessibleDatePicker';
import AriaSelect from '@/app/admin/components/AriaSelect';
import { 
  geocodeLocation, 
  reverseGeocode,
  calculateDistance,
  estimateTravelTime,
  formatTravelTime
} from '@/app/services/geocoding';

interface EditFormProps {
  day?: JourneyDay;
  onSave: (data: Partial<JourneyDay>) => void;
  onCancel: () => void;
}

const EditForm: React.FC<EditFormProps> = ({ day, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<JourneyDay>>(
    day || {
      date: new Date(),
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
    instagramPosts: [],
    tikTokPosts: [],
    blogPosts: [],
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
  });

  const [newBlogPost, setNewBlogPost] = useState<Partial<BlogPost>>({
    title: '',
    url: '',
  });

  const [newTikTokPost, setNewTikTokPost] = useState<Partial<TikTokPost>>({
    url: '',
    caption: '',
  });

  const [selectedLocationForPosts, setSelectedLocationForPosts] = useState<number>(-1);

  const [activeTab, setActiveTab] = useState<'basic' | 'location' | 'transport' | 'instagram' | 'tiktok' | 'blog'>('basic');
  const [geoLocationStatus, setGeoLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [geoLocationError, setGeoLocationError] = useState<string>('');
  
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [geocodeError, setGeocodeError] = useState<string>('');
  
  // Check if geolocation is available
  const isGeolocationAvailable = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: (name === 'date' || name === 'endDate') ? new Date(value) : value 
    }));
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

  const handleBlogPostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setNewBlogPost(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleTikTokPostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setNewTikTokPost(prev => ({
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
        newTransportation.type as Transportation['type']
      );
      
      // Set default times if none are set
      const now = new Date();
      const departureTime = newTransportation.departureTime || 
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
        name: newLocation.name!,  // Use non-null assertion since we've checked above
        coordinates: newLocation.coordinates || [0, 0] as [number, number],
        date: prev.date || new Date(), // Use the day's date
        arrivalTime: newLocation.arrivalTime,
        notes: newLocation.notes,
        instagramPosts: newLocation.instagramPosts || [],
        tikTokPosts: newLocation.tikTokPosts || [],
        blogPosts: newLocation.blogPosts || [],
      }]
    }));

    // Reset the form
    setNewLocation({
      name: '',
      coordinates: [0, 0],
      arrivalTime: '',
      notes: '',
      instagramPosts: [],
      tikTokPosts: [],
      blogPosts: [],
    });
  };
  
  const addTransportation = () => {
    if (!newTransportation.from || !newTransportation.to) return;
    
    setFormData(prev => ({
      ...prev,
      transportation: {
        id: `temp-${Date.now()}`,
        type: newTransportation.type || 'other',
        from: newTransportation.from!,  // Use non-null assertion since we've checked above
        to: newTransportation.to!,      // Use non-null assertion since we've checked above
        fromCoordinates: newTransportation.fromCoordinates || [0, 0] as [number, number],
        toCoordinates: newTransportation.toCoordinates || [0, 0] as [number, number],
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
        url: newPost.url!,  // Use non-null assertion since we've checked above
      }]
    }));

    // Reset the form
    setNewPost({
      url: '',
    });
  };

  const addTikTokPost = () => {
    if (!newTikTokPost.url) return;

    setFormData(prev => ({
      ...prev,
      tikTokPosts: [...(prev.tikTokPosts || []), {
        id: `temp-${Date.now()}`,
        url: newTikTokPost.url!,
        caption: newTikTokPost.caption || '',
      }]
    }));

    setNewTikTokPost({
      url: '',
      caption: '',
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

  const removeTikTokPost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tikTokPosts: prev.tikTokPosts?.filter((_, i) => i !== index),
    }));
  };

  const addInstagramPostToLocation = (locationIndex: number) => {
    if (!newPost.url || locationIndex < 0) return;
    
    setFormData(prev => {
      const updatedLocations = [...(prev.locations || [])];
      if (updatedLocations[locationIndex]) {
        updatedLocations[locationIndex] = {
          ...updatedLocations[locationIndex],
          instagramPosts: [
            ...(updatedLocations[locationIndex].instagramPosts || []),
            {
              id: `temp-${Date.now()}`,
              url: newPost.url!,
            }
          ]
        };
      }
      return { ...prev, locations: updatedLocations };
    });

    // Reset the form
    setNewPost({
      url: '',
    });
    setSelectedLocationForPosts(-1);
  };

  const addTikTokPostToLocation = (locationIndex: number) => {
    if (!newTikTokPost.url || locationIndex < 0) return;

    setFormData(prev => {
      const updatedLocations = [...(prev.locations || [])];
      if (updatedLocations[locationIndex]) {
        updatedLocations[locationIndex] = {
          ...updatedLocations[locationIndex],
          tikTokPosts: [
            ...(updatedLocations[locationIndex].tikTokPosts || []),
            {
              id: `temp-${Date.now()}`,
              url: newTikTokPost.url!,
              caption: newTikTokPost.caption || '',
            }
          ]
        };
      }
      return { ...prev, locations: updatedLocations };
    });

    setNewTikTokPost({
      url: '',
      caption: '',
    });
    setSelectedLocationForPosts(-1);
  };

  const addBlogPostToLocation = (locationIndex: number) => {
    if (!newBlogPost.title || !newBlogPost.url || locationIndex < 0) return;
    
    setFormData(prev => {
      const updatedLocations = [...(prev.locations || [])];
      if (updatedLocations[locationIndex]) {
        updatedLocations[locationIndex] = {
          ...updatedLocations[locationIndex],
          blogPosts: [
            ...(updatedLocations[locationIndex].blogPosts || []),
            {
              id: `temp-${Date.now()}`,
              title: newBlogPost.title!,
              url: newBlogPost.url!,
            }
          ]
        };
      }
      return { ...prev, locations: updatedLocations };
    });
    
    // Reset the form
    setNewBlogPost({
      title: '',
      url: '',
    });
    setSelectedLocationForPosts(-1);
  };

  const removeInstagramPostFromLocation = (locationIndex: number, postIndex: number) => {
    setFormData(prev => {
      const updatedLocations = [...(prev.locations || [])];
      if (updatedLocations[locationIndex]) {
        updatedLocations[locationIndex] = {
          ...updatedLocations[locationIndex],
          instagramPosts: updatedLocations[locationIndex].instagramPosts?.filter((_, i) => i !== postIndex) || []
        };
      }
      return { ...prev, locations: updatedLocations };
    });
  };

  const removeBlogPostFromLocation = (locationIndex: number, postIndex: number) => {
    setFormData(prev => {
      const updatedLocations = [...(prev.locations || [])];
      if (updatedLocations[locationIndex]) {
        updatedLocations[locationIndex] = {
          ...updatedLocations[locationIndex],
          blogPosts: updatedLocations[locationIndex].blogPosts?.filter((_, i) => i !== postIndex) || []
        };
      }
      return { ...prev, locations: updatedLocations };
    });
  };

  const removeTikTokPostFromLocation = (locationIndex: number, postIndex: number) => {
    setFormData(prev => {
      const updatedLocations = [...(prev.locations || [])];
      if (updatedLocations[locationIndex]) {
        updatedLocations[locationIndex] = {
          ...updatedLocations[locationIndex],
          tikTokPosts: updatedLocations[locationIndex].tikTokPosts?.filter((_, i) => i !== postIndex) || []
        };
      }
      return { ...prev, locations: updatedLocations };
    });
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{day ? 'Edit Travel Period' : 'Add New Travel Period'}</h2>
      
      <div className="mt-4 border-b border-gray-200 dark:border-gray-700">
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
          <button
            type="button"
            onClick={() => setActiveTab('tiktok')}
            className={`pb-2 px-1 ${
              activeTab === 'tiktok'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-500'
            }`}
          >
            TikTok
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('blog')}
            className={`pb-2 px-1 ${
              activeTab === 'blog'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-500'
            }`}
          >
            Blog Posts
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
                className="w-full p-2 border rounded-sm"
                placeholder="Enter a title for this period"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="date" className="block mb-1 font-medium">
                  Start Date
                </label>
                <AccessibleDatePicker
                  id="editform-start-date"
                  value={formData.date instanceof Date ? formData.date : (formData.date ? new Date(formData.date) : null)}
                  onChange={(d) => setFormData(prev => ({ ...prev, date: d || undefined }))}
                  required
                  className="w-full"
                />
              </div>
              
              <div>
                <label htmlFor="endDate" className="block mb-1 font-medium">
                  End Date <span className="text-sm text-gray-500">(Optional)</span>
                </label>
                <AccessibleDatePicker
                  id="editform-end-date"
                  value={formData.endDate instanceof Date ? formData.endDate : (formData.endDate ? new Date(formData.endDate) : null)}
                  onChange={(d) => setFormData(prev => ({ ...prev, endDate: d || undefined }))}
                  className="w-full"
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
                className="w-full p-2 border rounded-sm h-32"
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
                    className="flex-1 p-2 border rounded-sm"
                    placeholder="Enter location name"
                  />
                  <button
                    type="button"
                    className="bg-blue-500 text-white px-3 py-2 rounded-sm hover:bg-blue-600"
                    onClick={handleLocationNameSearch}
                    disabled={geocodeStatus === 'loading'}
                  >
                    {geocodeStatus === 'loading' ? 'Searching...' : 'Find'}
                  </button>
                  {isGeolocationAvailable && (
                    <button
                      type="button"
                      className="bg-gray-200 text-gray-800 px-3 py-2 rounded-sm hover:bg-gray-300"
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
                    className="w-full p-2 border rounded-sm"
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
                    className="w-full p-2 border rounded-sm"
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
                  className="w-full p-2 border rounded-sm"
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
                  className="w-full p-2 border rounded-sm h-20"
                  placeholder="Any notes about this location..."
                />
              </div>
              
              <button
                type="button"
                onClick={addLocation}
                className="bg-blue-500 text-white px-4 py-2 rounded-sm hover:bg-blue-600"
              >
                Add Location
              </button>
            </div>
            
            {formData.locations && formData.locations.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Added Locations</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {formData.locations.map((location, index) => (
                    <div key={location.id || index} className="border p-3 rounded-sm">
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
                      
                      {/* Show attached posts count */}
                      {(location.blogPosts?.length || location.instagramPosts?.length) && (
                        <div className="mt-2 pt-2 border-t text-xs text-gray-500">
                          <div className="flex space-x-4">
                            {location.blogPosts && location.blogPosts.length > 0 && (
                              <span className="text-green-600">
                                📝 {location.blogPosts.length} blog post{location.blogPosts.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {location.instagramPosts && location.instagramPosts.length > 0 && (
                              <span className="text-blue-600">
                                📸 {location.instagramPosts.length} Instagram post{location.instagramPosts.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
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
                <AriaSelect
                  id="transportType"
                  name="type"
                  value={newTransportation.type}
                  onChange={(value) => handleTransportationChange({ target: { name: 'type', value } } as React.ChangeEvent<HTMLSelectElement>)}
                  className="w-full p-2"
                  options={[
                    { value: 'walk', label: 'Walking' },
                    { value: 'bike', label: 'Biking' },
                    { value: 'car', label: 'Car' },
                    { value: 'bus', label: 'Bus' },
                    { value: 'shuttle', label: 'Shuttle (shared)' },
                    { value: 'train', label: 'Train' },
                    { value: 'plane', label: 'Plane' },
                    { value: 'ferry', label: 'Ferry' },
                    { value: 'other', label: 'Other' }
                  ]}
                  placeholder="Select Transportation Type"
                />
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
                    className="flex-1 p-2 border rounded-sm"
                    placeholder="Starting location"
                  />
                  <button
                    type="button"
                    className="bg-blue-500 text-white px-3 py-2 rounded-sm hover:bg-blue-600"
                    onClick={() => handleTransportLocationSearch('from')}
                    disabled={geocodeStatus === 'loading'}
                  >
                    {geocodeStatus === 'loading' ? 'Searching...' : 'Find'}
                  </button>
                  {isGeolocationAvailable && (
                    <button
                      type="button"
                      className="bg-gray-200 text-gray-800 px-3 py-2 rounded-sm hover:bg-gray-300"
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
                    className="w-full p-2 border rounded-sm"
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
                    className="w-full p-2 border rounded-sm"
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
                    className="flex-1 p-2 border rounded-sm"
                    placeholder="Destination"
                  />
                  <button
                    type="button"
                    className="bg-blue-500 text-white px-3 py-2 rounded-sm hover:bg-blue-600"
                    onClick={() => handleTransportLocationSearch('to')}
                    disabled={geocodeStatus === 'loading'}
                  >
                    {geocodeStatus === 'loading' ? 'Searching...' : 'Find'}
                  </button>
                  {isGeolocationAvailable && (
                    <button
                      type="button"
                      className="bg-gray-200 text-gray-800 px-3 py-2 rounded-sm hover:bg-gray-300"
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
                    className="w-full p-2 border rounded-sm"
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
                    className="w-full p-2 border rounded-sm"
                    step="0.000001"
                  />
                </div>
              </div>
              
              <button
                type="button"
                onClick={calculateRouteInfo}
                className="mb-3 bg-gray-200 text-gray-800 px-4 py-2 rounded-sm hover:bg-gray-300"
                disabled={
                  isCalculatingRoute || 
                  !newTransportation.fromCoordinates || 
                  !newTransportation.toCoordinates
                }
              >
                {isCalculatingRoute ? 'Calculating...' : 'Calculate Route Info'}
              </button>
              
              {newTransportation.distance && (
                <div className="p-3 mb-3 bg-blue-50 rounded-sm text-blue-800">
                  <p>Distance: {newTransportation.distance} km</p>
                  <p>Estimated travel time: {formatTravelTime(estimateTravelTime(
                    newTransportation.distance,
                    newTransportation.type as Transportation['type']
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
                    className="w-full p-2 border rounded-sm"
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
                    className="w-full p-2 border rounded-sm"
                  />
                </div>
              </div>
              
              <button
                type="button"
                onClick={addTransportation}
                className="bg-blue-500 text-white px-4 py-2 rounded-sm hover:bg-blue-600"
              >
                Add Transportation
              </button>
            </div>
            
            {formData.transportation && (
              <div>
                <h3 className="font-medium mb-2">Added Transportation</h3>
                <div className="border p-3 rounded-sm">
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
                  className="w-full p-2 border rounded-sm"
                  placeholder="https://www.instagram.com/p/..."
                />
              </div>
              

              
              <button
                type="button"
                onClick={addInstagramPost}
                className="bg-blue-500 text-white px-4 py-2 rounded-sm hover:bg-blue-600"
              >
                Add Instagram Post
              </button>
            </div>
            
            {formData.instagramPosts && formData.instagramPosts.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Added Instagram Posts</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {formData.instagramPosts.map((post, index) => (
                    <div key={post.id || index} className="border p-3 rounded-sm">
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

                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TikTok Tab */}
        {activeTab === 'tiktok' && (
          <div>
            <div className="mb-4">
              <h3 className="font-medium mb-2">Add TikTok Post</h3>

              <div className="mb-3">
                <label htmlFor="tiktokUrl" className="block mb-1">
                  TikTok Post URL
                </label>
                <input
                  type="url"
                  id="tiktokUrl"
                  name="url"
                  value={newTikTokPost.url}
                  onChange={handleTikTokPostChange}
                  className="w-full p-2 border rounded-sm"
                  placeholder="https://www.tiktok.com/@username/video/..."
                />
              </div>

              <div className="mb-3">
                <label htmlFor="tiktokCaption" className="block mb-1">
                  Caption (optional)
                </label>
                <input
                  type="text"
                  id="tiktokCaption"
                  name="caption"
                  value={newTikTokPost.caption || ''}
                  onChange={handleTikTokPostChange}
                  className="w-full p-2 border rounded-sm"
                  placeholder="Add a short caption"
                />
              </div>

              <button
                type="button"
                onClick={addTikTokPost}
                className="bg-blue-500 text-white px-4 py-2 rounded-sm hover:bg-blue-600"
              >
                Add TikTok Post
              </button>
            </div>

            {formData.tikTokPosts && formData.tikTokPosts.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Added TikTok Posts</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {formData.tikTokPosts.map((post, index) => (
                    <div key={post.id || index} className="border p-3 rounded-sm">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            {post.url}
                          </a>
                          {post.caption && (
                            <p className="text-sm text-gray-600 mt-1">{post.caption}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTikTokPost(index)}
                          className="text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Blog Posts Tab */}
        {activeTab === 'blog' && (
          <div>
            {/* Add Blog Post to Specific Location */}
            {formData.locations && formData.locations.length > 0 && (
              <div className="mb-6">
                <h3 className="font-medium mb-2">Add Blog Post to Location</h3>
                <div className="mb-3">
                  <label htmlFor="locationSelect" className="block mb-1">
                    Select Location
                  </label>
                  <AriaSelect
                    id="locationSelect"
                    value={selectedLocationForPosts.toString()}
                    onChange={(value) => setSelectedLocationForPosts(parseInt(value))}
                    className="w-full p-2"
                    options={[
                      { value: '-1', label: 'Choose a location...' },
                      ...formData.locations.map((location, index) => ({
                        value: index.toString(),
                        label: location.name
                      }))
                    ]}
                    placeholder="Choose a location..."
                  />
                </div>
                
                {selectedLocationForPosts >= 0 && (
                  <div className="border p-4 rounded-sm bg-gray-50">
                    <h4 className="font-medium mb-3">Add Blog Post to {formData.locations[selectedLocationForPosts]?.name}</h4>
                    
                    <div className="mb-3">
                      <label htmlFor="blogTitle" className="block mb-1">
                        Blog Post Title
                      </label>
                      <input
                        type="text"
                        id="blogTitle"
                        name="title"
                        value={newBlogPost.title}
                        onChange={handleBlogPostChange}
                        className="w-full p-2 border rounded-sm"
                        placeholder="Enter blog post title"
                      />
                    </div>
                    
                    <div className="mb-3">
                      <label htmlFor="blogUrl" className="block mb-1">
                        Blog Post URL
                      </label>
                      <input
                        type="url"
                        id="blogUrl"
                        name="url"
                        value={newBlogPost.url}
                        onChange={handleBlogPostChange}
                        className="w-full p-2 border rounded-sm"
                        placeholder="https://yourblog.com/post/..."
                      />
                    </div>
                    

                    
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => addBlogPostToLocation(selectedLocationForPosts)}
                        className="bg-green-500 text-white px-4 py-2 rounded-sm hover:bg-green-600"
                        disabled={!newBlogPost.title || !newBlogPost.url}
                      >
                        Add Blog Post
                      </button>
                    </div>

                    <div className="mt-4 pt-4 border-t space-y-4">
                      {/* Quick Instagram Post Form */}
                      <div>
                        <h5 className="font-medium mb-2">Or add Instagram Post:</h5>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="url"
                            name="url"
                            value={newPost.url}
                            onChange={handlePostChange}
                            className="flex-1 p-2 border rounded-sm"
                            placeholder="https://www.instagram.com/p/..."
                          />
                          <button
                            type="button"
                            onClick={() => addInstagramPostToLocation(selectedLocationForPosts)}
                            className="bg-blue-500 text-white px-4 py-2 rounded-sm hover:bg-blue-600"
                            disabled={!newPost.url}
                          >
                            Add Instagram Post
                          </button>
                        </div>
                      </div>

                      {/* Quick TikTok Post Form */}
                      <div>
                        <h5 className="font-medium mb-2">Or add TikTok Post:</h5>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="url"
                            name="url"
                            value={newTikTokPost.url}
                            onChange={handleTikTokPostChange}
                            className="flex-1 p-2 border rounded-sm"
                            placeholder="https://www.tiktok.com/@username/video/..."
                          />
                          <input
                            type="text"
                            name="caption"
                            value={newTikTokPost.caption || ''}
                            onChange={handleTikTokPostChange}
                            className="flex-1 p-2 border rounded-sm"
                            placeholder="Caption (optional)"
                          />
                          <button
                            type="button"
                            onClick={() => addTikTokPostToLocation(selectedLocationForPosts)}
                            className="bg-black text-white px-4 py-2 rounded-sm hover:bg-gray-800"
                            disabled={!newTikTokPost.url}
                          >
                            Add TikTok Post
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Display Current Location Posts */}
            {formData.locations && formData.locations.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Location Posts</h3>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {formData.locations.map((location, locationIndex) => (
                    <div key={location.id} className="border p-4 rounded-sm">
                      <h4 className="font-medium mb-2">{location.name}</h4>
                      
                      {/* Blog Posts for this location */}
                      {location.blogPosts && location.blogPosts.length > 0 && (
                        <div className="mb-3">
                          <h5 className="text-sm font-medium text-green-700 mb-1">Blog Posts:</h5>
                          <div className="space-y-2">
                            {location.blogPosts.map((post, postIndex) => (
                              <div key={post.id} className="flex justify-between items-center bg-green-50 p-2 rounded-sm">
                                <div>
                                  <a
                                    href={post.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-green-600 hover:underline font-medium"
                                  >
                                    {post.title}
                                  </a>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeBlogPostFromLocation(locationIndex, postIndex)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Instagram Posts for this location */}
                      {location.instagramPosts && location.instagramPosts.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-blue-700 mb-1">Instagram Posts:</h5>
                          <div className="space-y-2">
                            {location.instagramPosts.map((post, postIndex) => (
                              <div key={post.id} className="flex justify-between items-center bg-blue-50 p-2 rounded-sm">
                                <div>
                                  <a
                                    href={post.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                  >
                                    {post.url.length > 50 ? `${post.url.substring(0, 50)}...` : post.url}
                                  </a>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeInstagramPostFromLocation(locationIndex, postIndex)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* TikTok Posts for this location */}
                      {location.tikTokPosts && location.tikTokPosts.length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-sm font-medium text-gray-800 mb-1">TikTok Posts:</h5>
                          <div className="space-y-2">
                            {location.tikTokPosts.map((post, postIndex) => (
                              <div key={post.id} className="flex justify-between items-center bg-gray-100 p-2 rounded-sm">
                                <div className="flex flex-col">
                                  <a
                                    href={post.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-700 hover:underline"
                                  >
                                    {post.url.length > 50 ? `${post.url.substring(0, 50)}...` : post.url}
                                  </a>
                                  {post.caption && (
                                    <span className="text-xs text-gray-500 mt-1">{post.caption}</span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeTikTokPostFromLocation(locationIndex, postIndex)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(!location.blogPosts || location.blogPosts.length === 0) &&
                       (!location.instagramPosts || location.instagramPosts.length === 0) &&
                       (!location.tikTokPosts || location.tikTokPosts.length === 0) && (
                        <p className="text-gray-500 text-sm">No posts attached to this location yet.</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!formData.locations || formData.locations.length === 0) && (
              <div className="text-center py-8 text-gray-500">
                <p>Add locations first to attach blog, Instagram, or TikTok posts to them.</p>
                <p className="text-sm mt-1">Go to the &quot;Locations&quot; tab to add your first location.</p>
              </div>
            )}
          </div>
        )}
        
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border rounded-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-sm hover:bg-blue-600"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditForm; 
