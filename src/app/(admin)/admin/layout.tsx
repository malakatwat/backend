import React from 'react';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  Trophy, 
  Stethoscope, 
  Users, 
  CreditCard, 
  Settings,
  LogOut,
  HelpCircle
} from 'lucide-react';
//import logo from '../../../../public/3.png'

const sidebarItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/admin' },
  { icon: Trophy, label: 'Challenges', href: '/admin/challenges' },
  { icon: Stethoscope, label: 'Doctors', href: '/admin/doctors' },
  { icon: HelpCircle, label: 'Questionnaire', href: '/admin/questionnaire' },
  { icon: Users, label: 'Users & Reports', href: '/admin/users' },
  { icon: CreditCard, label: 'Payments', href: '/admin/payments' },
  { icon: Settings, label: 'Settings', href: '/admin/settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-6 border-b">
         <img src='/3.png' />
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {sidebarItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-green-50 hover:text-green-600 rounded-lg transition-colors"
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t">
          <button className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-lg">
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}