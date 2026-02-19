'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, Loader2, X, Star, Stethoscope, Phone, Mail, ChevronDown } from 'lucide-react';

// --- CONFIGURATION ---
const COUNTRY_CODES = [
  { code: '+971', label: 'UAE', flag: '🇦🇪' },
  { code: '+966', label: 'KSA', flag: '🇸🇦' },
  { code: '+965', label: 'KWT', flag: '🇰🇼' },
  { code: '+974', label: 'QAT', flag: '🇶🇦' },
  { code: '+973', label: 'BHR', flag: '🇧🇭' },
  { code: '+968', label: 'OMN', flag: '🇴🇲' },
  { code: '+1',   label: 'USA', flag: '🇺🇸' },
  { code: '+44',  label: 'UK',  flag: '🇬🇧' },
  { code: '+91',  label: 'IND', flag: '🇮🇳' },
];

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  bio: string;
  rating: number;
  is_available: boolean;
  email: string;
  phone: string;
}

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form State
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // We separate phone number and country code in the form state
  const [formData, setFormData] = useState({
    name: '',
    specialty: '',
    bio: '',
    rating: 5.0,
    is_available: true,
    email: '',
    phoneNumber: '', // Just the digits (e.g. 501234567)
    countryCode: '+971' // Default to UAE
  });

  // 1. Fetch Data
  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      const res = await fetch('/api/doctors');
      const data = await res.json();
      const formatted = Array.isArray(data) ? data.map((d: any) => ({
        ...d,
        is_available: Boolean(d.is_available)
      })) : [];
      setDoctors(formatted);
    } catch (error) {
      console.error('Failed to fetch doctors', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Handle Delete
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this doctor profile?')) return;
    try {
      await fetch(`/api/doctors?id=${id}`, { method: 'DELETE' });
      setDoctors((prev) => prev.filter((d) => d.id !== id));
    } catch (error) {
      alert('Failed to delete');
    }
  };

  // 3. Handle Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Combine Code + Number before saving
    const fullPhone = formData.phoneNumber 
      ? `${formData.countryCode}${formData.phoneNumber}` 
      : '';

    const payload = {
        name: formData.name,
        specialty: formData.specialty,
        bio: formData.bio,
        rating: formData.rating,
        is_available: formData.is_available,
        email: formData.email,
        phone: fullPhone
    };

    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { ...payload, id: editingId } : payload;

      const res = await fetch('/api/doctors', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to save');

      await fetchDoctors();
      closeModal();
    } catch (error) {
      alert('Error saving doctor');
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData({ 
        name: '', specialty: '', bio: '', rating: 5.0, is_available: true, email: '', 
        phoneNumber: '', 
        countryCode: '+971' // Reset to Default
    });
    setIsModalOpen(true);
  };

  const openEdit = (doc: Doctor) => {
    setEditingId(doc.id);
    
    // Logic to split the existing full phone number back into Code + Number
    let foundCode = '+971';
    let cleanNumber = doc.phone || '';

    if (cleanNumber) {
        // Find which country code the phone number starts with
        const matched = COUNTRY_CODES.find(c => cleanNumber.startsWith(c.code));
        if (matched) {
            foundCode = matched.code;
            cleanNumber = cleanNumber.replace(matched.code, ''); // Remove code to get just the number
        }
    }

    setFormData({
      name: doc.name,
      specialty: doc.specialty,
      bio: doc.bio || '',
      rating: doc.rating,
      is_available: doc.is_available,
      email: doc.email || '',
      countryCode: foundCode,
      phoneNumber: cleanNumber
    });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-green-600"/></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-800">Doctors Management</h2>
        <button 
          onClick={openCreate}
          className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 transition"
        >
          <Plus size={20} /> Add Doctor
        </button>
      </div>

      {/* Grid Layout for Doctors Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {doctors.length === 0 ? (
            <div className="col-span-3 text-center text-gray-500 py-10">No doctors found.</div>
        ) : (
            doctors.map((doc) => (
                <div key={doc.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                <Stethoscope size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">{doc.name}</h3>
                                <p className="text-sm text-green-600 font-medium">{doc.specialty}</p>
                            </div>
                        </div>
                        <div className="flex gap-1">
                             <button onClick={() => openEdit(doc)} className="text-gray-400 hover:text-blue-600 p-1">
                                <Edit size={18} />
                             </button>
                             <button onClick={() => handleDelete(doc.id)} className="text-gray-400 hover:text-red-600 p-1">
                                <Trash2 size={18} />
                             </button>
                        </div>
                    </div>
                    
                    {/* Contact Info Preview */}
                    <div className="space-y-1 mb-3">
                        {doc.email && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Mail size={14} /> {doc.email}
                            </div>
                        )}
                        {doc.phone && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Phone size={14} /> {doc.phone}
                            </div>
                        )}
                    </div>
                    
                    <p className="text-gray-500 text-sm mb-4 line-clamp-2 flex-1 border-t pt-2">
                        {doc.bio || 'No biography available.'}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t mt-auto">
                        <div className="flex items-center gap-1 text-yellow-500 font-bold text-sm">
                            <Star size={16} fill="currentColor" />
                            {doc.rating}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            doc.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                            {doc.is_available ? 'Available' : 'Unavailable'}
                        </span>
                    </div>
                </div>
            ))
        )}
      </div>

      {/* MODAL FORM */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold">{editingId ? 'Edit Profile' : 'New Doctor'}</h3>
              <button onClick={closeModal}><X size={20} className="text-gray-500 hover:text-red-500"/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Name & Specialty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input 
                    type="text" 
                    required
                    placeholder="e.g. Dr. Sarah"
                    className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
                    <input 
                    type="text" 
                    required
                    placeholder="e.g. Dietitian"
                    className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                    value={formData.specialty}
                    onChange={e => setFormData({...formData, specialty: e.target.value})}
                    />
                </div>
              </div>

              {/* Contact Info - UPDATED with Country Code Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input 
                  type="email" 
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none mb-4"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
                
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <div className="flex gap-2">
                    {/* Country Code Select */}
                    <div className="relative">
                        <select
                            className="appearance-none bg-gray-50 border rounded-lg py-2 pl-3 pr-8 focus:ring-2 focus:ring-green-500 outline-none h-full"
                            value={formData.countryCode}
                            onChange={(e) => setFormData({...formData, countryCode: e.target.value})}
                        >
                            {COUNTRY_CODES.map((country) => (
                                <option key={country.code} value={country.code}>
                                    {country.flag} {country.code}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                            <ChevronDown size={14} />
                        </div>
                    </div>

                    {/* Phone Input */}
                    <input 
                        type="tel" 
                        placeholder="50 123 4567"
                        className="flex-1 border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                        value={formData.phoneNumber}
                        onChange={e => setFormData({...formData, phoneNumber: e.target.value.replace(/[^0-9]/g, '')})} // Only numbers
                    />
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                <textarea 
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                  rows={3}
                  placeholder="Short description..."
                  value={formData.bio}
                  onChange={e => setFormData({...formData, bio: e.target.value})}
                />
              </div>

              {/* Rating & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                    <input 
                    type="number" 
                    step="0.1"
                    min="0"
                    max="5"
                    className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                    value={formData.rating}
                    onChange={e => setFormData({...formData, rating: parseFloat(e.target.value)})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select 
                        className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                        value={formData.is_available ? 'true' : 'false'}
                        onChange={e => setFormData({...formData, is_available: e.target.value === 'true'})}
                    >
                        <option value="true">Available</option>
                        <option value="false">Unavailable</option>
                    </select>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="flex-1 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}