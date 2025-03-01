'use client';

import { useState } from 'react';
import { JourneyDay, Location, Transportation, InstagramPost } from '../types';

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
    <div className="bg-white rounded-lg shadow p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">{day ? 'Edit Day' : 'Add New Day'}</h2>
        <button 
          type="button"
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="mb-6">
        <div className="flex border-b">
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'basic' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500'}`}
            onClick={() => setActiveTab('basic')}
          >
            Basic Info
          </button>
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'location' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500'}`}
            onClick={() => setActiveTab('location')}
          >
            Locations
          </button>
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'transport' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500'}`}
            onClick={() => setActiveTab('transport')}
          >
            Transportation
          </button>
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'instagram' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500'}`}
            onClick={() => setActiveTab('instagram')}
          >
            Instagram
          </button>
        </div>
      </div>
      
      <form onSubmit={handleSubmit}>
        {/* Basic Info Tab */}
        {activeTab === 'basic' && (
          <div>
            <div className="mb-4">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Day Title
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Day Title"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                Date
              </label>
              <input
                type="date"
                id="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="customNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                id="customNotes"
                name="customNotes"
                value={formData.customNotes}
                onChange={handleChange}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Any notes about this day..."
              />
            </div>
          </div>
        )}
        
        {/* Locations Tab */}
        {activeTab === 'location' && (
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Current Locations</h3>
              {formData.locations && formData.locations.length > 0 ? (
                <div className="space-y-2">
                  {formData.locations.map((location, index) => (
                    <div key={location.id} className="flex justify-between items-center border p-3 rounded-md">
                      <div>
                        <div className="font-medium">{location.name}</div>
                        <div className="text-xs text-gray-500">
                          Coordinates: {location.coordinates[0]}, {location.coordinates[1]}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLocation(index)}
                        className="text-red-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No locations added yet.</p>
              )}
            </div>
            
            <div className="border-t pt-4 mt-4">
              <h3 className="text-lg font-medium mb-2">Add Location</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Location Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={newLocation.name}
                    onChange={handleLocationChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Location Name"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="lat" className="block text-sm font-medium text-gray-700 mb-1">
                      Latitude
                    </label>
                    <input
                      type="number"
                      id="lat"
                      step="0.000001"
                      value={newLocation.coordinates?.[0] || 0}
                      onChange={(e) => handleLocationCoordinatesChange(e, 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="lng" className="block text-sm font-medium text-gray-700 mb-1">
                      Longitude
                    </label>
                    <input
                      type="number"
                      id="lng"
                      step="0.000001"
                      value={newLocation.coordinates?.[1] || 0}
                      onChange={(e) => handleLocationCoordinatesChange(e, 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="arrivalTime" className="block text-sm font-medium text-gray-700 mb-1">
                    Arrival Time
                  </label>
                  <input
                    type="time"
                    id="arrivalTime"
                    name="arrivalTime"
                    value={newLocation.arrivalTime}
                    onChange={handleLocationChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label htmlFor="locationNotes" className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    id="locationNotes"
                    name="notes"
                    value={newLocation.notes}
                    onChange={handleLocationChange}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Any notes about this location..."
                  />
                </div>
                
                <button
                  type="button"
                  onClick={addLocation}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Add Location
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Transportation Tab */}
        {activeTab === 'transport' && (
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Current Transportation</h3>
              {formData.transportation ? (
                <div className="border p-3 rounded-md">
                  <div className="flex justify-between">
                    <div>
                      <div className="font-medium capitalize">
                        {formData.transportation.type} from {formData.transportation.from} to {formData.transportation.to}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formData.transportation.distance && `Distance: ${formData.transportation.distance} km`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeTransportation}
                      className="text-red-500"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No transportation added yet.</p>
              )}
            </div>
            
            <div className="border-t pt-4 mt-4">
              <h3 className="text-lg font-medium mb-2">Add Transportation</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                    Transportation Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    value={newTransportation.type}
                    onChange={handleTransportationChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="walk">Walk</option>
                    <option value="bus">Bus</option>
                    <option value="train">Train</option>
                    <option value="plane">Plane</option>
                    <option value="car">Car</option>
                    <option value="ferry">Ferry</option>
                    <option value="bike">Bike</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="from" className="block text-sm font-medium text-gray-700 mb-1">
                      From
                    </label>
                    <input
                      type="text"
                      id="from"
                      name="from"
                      value={newTransportation.from}
                      onChange={handleTransportationChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Starting Location"
                    />
                  </div>
                  <div>
                    <label htmlFor="to" className="block text-sm font-medium text-gray-700 mb-1">
                      To
                    </label>
                    <input
                      type="text"
                      id="to"
                      name="to"
                      value={newTransportation.to}
                      onChange={handleTransportationChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Ending Location"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="fromLat" className="block text-sm font-medium text-gray-700 mb-1">
                      From Latitude
                    </label>
                    <input
                      type="number"
                      id="fromLat"
                      step="0.000001"
                      value={newTransportation.fromCoordinates?.[0] || 0}
                      onChange={(e) => handleTransportationCoordinatesChange(e, 'fromCoordinates', 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="fromLng" className="block text-sm font-medium text-gray-700 mb-1">
                      From Longitude
                    </label>
                    <input
                      type="number"
                      id="fromLng"
                      step="0.000001"
                      value={newTransportation.fromCoordinates?.[1] || 0}
                      onChange={(e) => handleTransportationCoordinatesChange(e, 'fromCoordinates', 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="toLat" className="block text-sm font-medium text-gray-700 mb-1">
                      To Latitude
                    </label>
                    <input
                      type="number"
                      id="toLat"
                      step="0.000001"
                      value={newTransportation.toCoordinates?.[0] || 0}
                      onChange={(e) => handleTransportationCoordinatesChange(e, 'toCoordinates', 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="toLng" className="block text-sm font-medium text-gray-700 mb-1">
                      To Longitude
                    </label>
                    <input
                      type="number"
                      id="toLng"
                      step="0.000001"
                      value={newTransportation.toCoordinates?.[1] || 0}
                      onChange={(e) => handleTransportationCoordinatesChange(e, 'toCoordinates', 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="departureTime" className="block text-sm font-medium text-gray-700 mb-1">
                      Departure Time
                    </label>
                    <input
                      type="time"
                      id="departureTime"
                      name="departureTime"
                      value={newTransportation.departureTime}
                      onChange={handleTransportationChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="arrivalTime" className="block text-sm font-medium text-gray-700 mb-1">
                      Arrival Time
                    </label>
                    <input
                      type="time"
                      id="arrivalTime"
                      name="arrivalTime"
                      value={newTransportation.arrivalTime}
                      onChange={handleTransportationChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label htmlFor="distance" className="block text-sm font-medium text-gray-700 mb-1">
                      Distance (km)
                    </label>
                    <input
                      type="number"
                      id="distance"
                      name="distance"
                      value={newTransportation.distance || ''}
                      onChange={handleTransportationChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={addTransportation}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Add Transportation
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Instagram Tab */}
        {activeTab === 'instagram' && (
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Instagram Posts</h3>
              {formData.instagramPosts && formData.instagramPosts.length > 0 ? (
                <div className="space-y-2">
                  {formData.instagramPosts.map((post, index) => (
                    <div key={post.id} className="flex justify-between items-center border p-3 rounded-md">
                      <div>
                        <div className="font-medium">{post.url}</div>
                        <div className="text-xs text-gray-500">
                          {post.offline ? 'Offline Post' : 'Online Post'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeInstagramPost(index)}
                        className="text-red-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No Instagram posts added yet.</p>
              )}
            </div>
            
            <div className="border-t pt-4 mt-4">
              <h3 className="text-lg font-medium mb-2">Add Instagram Post</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="postUrl" className="block text-sm font-medium text-gray-700 mb-1">
                    Instagram Post URL
                  </label>
                  <input
                    type="text"
                    id="postUrl"
                    name="url"
                    value={newPost.url}
                    onChange={handlePostChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="https://www.instagram.com/p/..."
                  />
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="offline"
                    name="offline"
                    checked={newPost.offline}
                    onChange={handlePostChange}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor="offline" className="ml-2 block text-sm text-gray-700">
                    Save as offline post (will be synced later)
                  </label>
                </div>
                
                <button
                  type="button"
                  onClick={addInstagramPost}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Add Instagram Post
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditForm; 