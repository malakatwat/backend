'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, Loader2, X } from 'lucide-react';

// Define the shape of a Challenge
interface Challenge {
  id: number;
  title: string;
  description: string;
  duration_days: number;
  status: 'active' | 'upcoming' | 'ended';
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form State (for Create/Edit)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration_days: 30,
    status: 'upcoming'
  });

  // 1. Fetch Challenges on Load
  useEffect(() => {
    fetchChallenges();
  }, []);

  const fetchChallenges = async () => {
    try {
      const res = await fetch('/api/challenges');
      const data = await res.json();
      if (Array.isArray(data)) {
        setChallenges(data);
      }
    } catch (error) {
      console.error('Failed to fetch challenges', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Handle Delete
  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this challenge?')) return;

    try {
      await fetch(`/api/challenges?id=${id}`, { method: 'DELETE' });
      // Remove from UI immediately
      setChallenges((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      alert('Failed to delete');
    }
  };

  // 3. Handle Form Submit (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { ...formData, id: editingId } : formData;

      const res = await fetch('/api/challenges', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to save');

      // Refresh list and close modal
      await fetchChallenges();
      closeModal();
    } catch (error) {
      alert('Error saving challenge');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to open modal for Editing
  const openEdit = (challenge: Challenge) => {
    setEditingId(challenge.id);
    setFormData({
      title: challenge.title,
      description: challenge.description || '',
      duration_days: challenge.duration_days,
      status: challenge.status as string,
    });
    setIsModalOpen(true);
  };

  // Helper to open modal for Creating
  const openCreate = () => {
    setEditingId(null);
    setFormData({ title: '', description: '', duration_days: 30, status: 'upcoming' });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-green-600"/></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-800">Challenges</h2>
        <button 
          onClick={openCreate}
          className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 transition"
        >
          <Plus size={20} /> Create Challenge
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-600">Title</th>
              <th className="p-4 font-semibold text-gray-600">Duration</th>
              <th className="p-4 font-semibold text-gray-600">Status</th>
              <th className="p-4 font-semibold text-gray-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {challenges.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-500">No challenges found. Create one!</td></tr>
            ) : (
                challenges.map((challenge) => (
                <tr key={challenge.id} className="hover:bg-gray-50 transition">
                    <td className="p-4 font-medium text-gray-800">
                        {challenge.title}
                        <div className="text-xs text-gray-500 font-normal">{challenge.description}</div>
                    </td>
                    <td className="p-4 text-gray-600">{challenge.duration_days} Days</td>
                    <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                        challenge.status === 'active' ? 'bg-green-100 text-green-700' : 
                        challenge.status === 'ended' ? 'bg-gray-100 text-gray-600' :
                        'bg-yellow-100 text-yellow-700'
                    }`}>
                        {challenge.status}
                    </span>
                    </td>
                    <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                        <button onClick={() => openEdit(challenge)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-full">
                            <Edit size={18} />
                        </button>
                        <button onClick={() => handleDelete(challenge.id)} className="text-red-600 hover:bg-red-50 p-2 rounded-full">
                            <Trash2 size={18} />
                        </button>
                    </div>
                    </td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL FORM */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold">{editingId ? 'Edit Challenge' : 'New Challenge'}</h3>
              <button onClick={closeModal}><X size={20} className="text-gray-500 hover:text-red-500"/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input 
                  type="text" 
                  required
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea 
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Days)</label>
                    <input 
                    type="number" 
                    required
                    className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                    value={formData.duration_days}
                    onChange={e => setFormData({...formData, duration_days: parseInt(e.target.value)})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select 
                        className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                        value={formData.status}
                        onChange={e => setFormData({...formData, status: e.target.value})}
                    >
                        <option value="upcoming">Upcoming</option>
                        <option value="active">Active</option>
                        <option value="ended">Ended</option>
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
                  {isSaving ? 'Saving...' : 'Save Challenge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}