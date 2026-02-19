'use client';

import React, { useEffect, useState } from 'react';
import { Users, Loader2, Search, Trash2, Activity, Target, Shield } from 'lucide-react';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'doctor';
  goal: string | null;
  age: number | null;
  current_weight: string | null;
  target_weight: string | null;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch users', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number, role: string) => {
    if (role === 'admin') {
      alert("You cannot delete an admin from this panel.");
      return;
    }
    if (!confirm('Are you sure you want to delete this user? All their data will be lost.')) return;
    
    try {
      await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (error) {
      alert('Failed to delete user');
    }
  };

  // Stats calculation
  const totalUsers = users.length;
  const clientCount = users.filter(u => u.role === 'user').length;
  const staffCount = users.filter(u => u.role !== 'user').length;

  // Filter for search
  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper for progress report text
  const getProgressReport = (current: string | null, target: string | null) => {
    if (!current || !target) return <span className="text-gray-400 italic text-sm">No data</span>;
    
    const curr = parseFloat(current);
    const tgt = parseFloat(target);
    const diff = Math.abs(curr - tgt).toFixed(1);
    
    if (curr === tgt) return <span className="text-green-600 font-medium text-sm">Goal Reached! 🎉</span>;
    if (curr > tgt) return <span className="text-blue-600 font-medium text-sm">Needs to lose {diff}kg</span>;
    return <span className="text-orange-600 font-medium text-sm">Needs to gain {diff}kg</span>;
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-green-600 w-10 h-10"/></div>;

  return (
    <div>
      {/* Header & Stats */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">Users & Reports</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium mb-1">Total Accounts</p>
              <h4 className="text-3xl font-bold text-gray-900">{totalUsers}</h4>
            </div>
            <div className="bg-blue-100 p-4 rounded-full text-blue-600">
              <Users size={24} />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium mb-1">App Clients</p>
              <h4 className="text-3xl font-bold text-gray-900">{clientCount}</h4>
            </div>
            <div className="bg-green-100 p-4 rounded-full text-green-600">
              <Activity size={24} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium mb-1">Staff (Admins/Doctors)</p>
              <h4 className="text-3xl font-bold text-gray-900">{staffCount}</h4>
            </div>
            <div className="bg-purple-100 p-4 rounded-full text-purple-600">
              <Shield size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-gray-800 text-lg">User Directory</h3>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search name or email..." 
                    className="pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-white border-b">
                    <tr>
                        <th className="p-4 font-semibold text-gray-500 text-sm">User Details</th>
                        <th className="p-4 font-semibold text-gray-500 text-sm">Role</th>
                        <th className="p-4 font-semibold text-gray-500 text-sm">Metrics & Progress Report</th>
                        <th className="p-4 font-semibold text-gray-500 text-sm">Joined Date</th>
                        <th className="p-4 font-semibold text-gray-500 text-sm text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {filteredUsers.length === 0 ? (
                        <tr><td colSpan={5} className="p-8 text-center text-gray-500">No users found.</td></tr>
                    ) : (
                        filteredUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50 transition">
                                <td className="p-4">
                                    <div className="font-medium text-gray-900">{user.name}</div>
                                    <div className="text-xs text-gray-500">{user.email}</div>
                                </td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                                        user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                        user.role === 'doctor' ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-700'
                                    }`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {user.role === 'user' ? (
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1 text-xs text-gray-600">
                                                <Target size={12} className="text-gray-400"/> 
                                                <span className="font-medium">{user.goal || 'No Goal Set'}</span>
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                Weight: {user.current_weight || '?'}kg → {user.target_weight || '?'}kg
                                            </div>
                                            {getProgressReport(user.current_weight, user.target_weight)}
                                        </div>
                                    ) : (
                                        <span className="text-gray-400 text-sm italic">N/A for Staff</span>
                                    )}
                                </td>
                                <td className="p-4 text-sm text-gray-600">
                                    {new Date(user.created_at).toLocaleDateString('en-US', {
                                        year: 'numeric', month: 'short', day: 'numeric'
                                    })}
                                </td>
                                <td className="p-4 text-right">
                                    <button 
                                      onClick={() => handleDelete(user.id, user.role)} 
                                      className="text-gray-400 hover:text-red-600 p-2 rounded-full transition"
                                      title="Delete User"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}