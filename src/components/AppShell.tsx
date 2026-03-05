'use client';

import Sidebar from '@/components/Sidebar';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from './AuthProvider';

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const isLoginPage = pathname === '/login';
    const showSidebar = !isLoginPage && (loading || !!user); // show sidebar shell during load too

    // Client-side auth guard (replaces middleware): redirect only after loading is done
    useEffect(() => {
        if (loading) return;

        if (!isLoginPage && !user) {
            router.replace('/login');
            return;
        }
        if (isLoginPage && user) {
            router.replace(user.role === 'manager' ? '/stock' : '/');
        }
    }, [loading, user, isLoginPage, router]);

    return (
        <>
            {showSidebar && (
                <>
                    <Sidebar
                        mobileOpen={sidebarOpen}
                        onClose={() => setSidebarOpen(false)}
                    />
                    <div
                        className="sidebar-backdrop"
                        aria-hidden={!sidebarOpen}
                        style={{ display: sidebarOpen ? 'block' : 'none' }}
                        onClick={() => setSidebarOpen(false)}
                    />
                </>
            )}
            <div className={showSidebar ? 'main' : 'w-full h-full'}>
                {showSidebar && (
                    <header className="mobile-header" aria-label="Mobile menu">
                        <button
                            type="button"
                            className="mobile-menu-btn"
                            onClick={() => setSidebarOpen(true)}
                            aria-label="Open menu"
                        >
                            <Menu size={24} />
                        </button>
                        <span className="mobile-header-title">MSK</span>
                    </header>
                )}
                {children}
            </div>
            <div className="notif" id="notif"></div>
        </>
    );
}
