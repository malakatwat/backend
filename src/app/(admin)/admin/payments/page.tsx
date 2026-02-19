'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2, Search, ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, XCircle } from 'lucide-react';

interface Payment {
  id: number;
  amount: string; // Decimal comes back as string from mysql sometimes
  currency: string;
  payment_method: string;
  status: 'succeeded' | 'pending' | 'failed';
  transaction_id: string;
  created_at: string;
  user_name: string;
  user_email: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const res = await fetch('/api/payments');
      const data = await res.json();
      setPayments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch payments', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate stats
  const totalRevenue = payments
    .filter(p => p.status === 'succeeded')
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
  const successfulCount = payments.filter(p => p.status === 'succeeded').length;

  // Filter payments based on search
  const filteredPayments = payments.filter(p => 
    p.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.user_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper for status styling
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'succeeded':
        return <span className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium"><CheckCircle2 size={12}/> Succeeded</span>;
      case 'pending':
        return <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-medium"><Clock size={12}/> Pending</span>;
      case 'failed':
        return <span className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-medium"><XCircle size={12}/> Failed</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-green-600 w-10 h-10"/></div>;

  return (
    <div>
      {/* Header & Stats */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">Payments & Revenue</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium mb-1">Total Lifetime Revenue</p>
              <h4 className="text-3xl font-bold text-gray-900">${totalRevenue.toFixed(2)}</h4>
            </div>
            <div className="bg-green-100 p-4 rounded-full text-green-600">
              <ArrowUpRight size={24} />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium mb-1">Successful Transactions</p>
              <h4 className="text-3xl font-bold text-gray-900">{successfulCount}</h4>
            </div>
            <div className="bg-blue-100 p-4 rounded-full text-blue-600">
              <CreditCard size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-gray-800 text-lg">Transaction History</h3>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search customer..." 
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
                        <th className="p-4 font-semibold text-gray-500 text-sm">Customer</th>
                        <th className="p-4 font-semibold text-gray-500 text-sm">Amount</th>
                        <th className="p-4 font-semibold text-gray-500 text-sm">Status</th>
                        <th className="p-4 font-semibold text-gray-500 text-sm">Date</th>
                        <th className="p-4 font-semibold text-gray-500 text-sm">Method</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {filteredPayments.length === 0 ? (
                        <tr><td colSpan={5} className="p-8 text-center text-gray-500">No transactions found.</td></tr>
                    ) : (
                        filteredPayments.map((payment) => (
                            <tr key={payment.id} className="hover:bg-gray-50 transition">
                                <td className="p-4">
                                    <div className="font-medium text-gray-900">{payment.user_name || 'Unknown User'}</div>
                                    <div className="text-xs text-gray-500">{payment.user_email}</div>
                                </td>
                                <td className="p-4 font-bold text-gray-800">
                                    {payment.currency === 'USD' ? '$' : payment.currency}{parseFloat(payment.amount).toFixed(2)}
                                </td>
                                <td className="p-4">
                                    {getStatusBadge(payment.status)}
                                </td>
                                <td className="p-4 text-sm text-gray-600">
                                    {new Date(payment.created_at).toLocaleDateString('en-US', {
                                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                </td>
                                <td className="p-4 text-sm text-gray-600 capitalize">
                                    {payment.payment_method || 'N/A'}
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