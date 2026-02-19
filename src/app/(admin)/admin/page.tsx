'use client'; // 1. Convert to Client Component

import React, { useEffect, useState } from 'react';
import { 
  Users, 
  DollarSign, 
  Activity, 
  TrendingUp, 
  Calendar,
  Loader2
} from 'lucide-react';

// Define the shape of the data
interface DashboardData {
  totalUsers: number;
  totalRevenue: number;
  activeChallenges: number;
  recentUsers: {
    id: number;
    name: string;
    email: string;
    joinedDate: string;
    status?: string;
  }[];
}

export default function AdminDashboard() {
  // 2. State for data and loading
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 3. Fetch data on load
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/dashboard/stats');
        
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }

        const jsonData = await response.json();
        setData(jsonData);
      } catch (err: any) {
        console.error(err);
        setError('Could not load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  // 4. Loading State
  if (loading) {
    return (
      <div className="flex h-[50vh] justify-center items-center">
        <Loader2 className="animate-spin text-green-600 w-10 h-10" />
      </div>
    );
  }

  // 5. Error State
  if (error) {
    return (
      <div className="p-6 text-red-600 bg-red-50 rounded-lg">
        Error: {error}
      </div>
    );
  }

  // 6. Render Dashboard
  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-6">Dashboard Overview</h2>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard 
          title="Total Users" 
          value={data?.totalUsers.toLocaleString() || '0'} 
          icon={Users} 
          color="bg-blue-500" 
        />
        <StatCard 
          title="Total Revenue" 
          value={`$${data?.totalRevenue.toLocaleString() || '0'}`} 
          icon={DollarSign} 
          color="bg-green-500" 
        />
        <StatCard 
          title="Active Challenges" 
          value={data?.activeChallenges.toString() || '0'} 
          icon={Activity} 
          color="bg-orange-500" 
        />
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-800">Recent Registrations</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3 font-semibold text-gray-600 text-sm">Name</th>
                <th className="p-3 font-semibold text-gray-600 text-sm">Email</th>
                <th className="p-3 font-semibold text-gray-600 text-sm">Joined Date</th>
                <th className="p-3 font-semibold text-gray-600 text-sm">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.recentUsers.length === 0 ? (
                <tr>
                   <td colSpan={4} className="p-4 text-center text-gray-500">No recent users found.</td>
                </tr>
              ) : (
                data?.recentUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3 text-gray-800 font-medium">{user.name}</td>
                    <td className="p-3 text-gray-500">{user.email}</td>
                    <td className="p-3 text-gray-500 flex items-center gap-2">
                      <Calendar size={14} /> {user.joinedDate}
                    </td>
                    <td className="p-3">
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                        Active
                      </span>
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

// Reusable Stat Card Component
function StatCard({ title, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
      <div>
        <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
        <h4 className="text-3xl font-bold text-gray-800 mb-2">{value}</h4>
      </div>
      <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
    </div>
  );
}