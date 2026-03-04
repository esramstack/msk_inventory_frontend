'use client';

import Image from 'next/image';
import { useAuth } from './AuthProvider';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BACKEND_URL } from '@/lib/config';
import {
    LayoutDashboard,
    PackageSearch,
    BarChart3,
    ReceiptText,
    PlusCircle,
    Box,
    Settings,
    Users,
    LogOut,
    FileText
} from 'lucide-react';

export default function Sidebar() {
    const { user, loading, refreshAuth } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    if (loading) {
        return (
            <div className="sidebar">
                <div className="s-logo">
                    <Image src="/logo_black.png" alt="MSK Aesthetics By Dr. Salman" width={140} height={56} className="s-logo-img" priority />
                </div>
                <div style={{ padding: '20px 12px', color: 'var(--text3)', fontSize: '13px' }}>
                    Loading...
                </div>
            </div>
        );
    }

    if (!user) return null;

    const isAdmin = user.role === 'admin';
    const initial = user.name
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    const handleLogout = async () => {
        try {
            await fetch(`${BACKEND_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
            await refreshAuth();
            router.push('/login');
        } catch (e) {
            console.error('Logout failed', e);
        }
    };

    // Improved active logic
    const isRouteActive = (path: string) => {
        if (pathname === path) return true;

        // Special case: prevent /sales/add from activating /sales
        if (path === '/sales' && pathname.startsWith('/sales/add')) {
            return false;
        }

        return path !== '/' && pathname.startsWith(`${path}/`);
    };

    const navLink = (
        path: string,
        label: string,
        icon: React.ReactNode,
        hideForManager = false,
        countBadge?: number
    ) => {
        if (hideForManager && !isAdmin) return null;

        const isActive = isRouteActive(path);

        return (
            <Link
                href={path}
                key={path}
                className={`nav ${isActive ? 'active' : ''}`}
            >
                {icon}
                {label}
                {countBadge !== undefined && countBadge > 0 && (
                    <span className="badge">
                        {label === 'Quotes / Invoices' ? countBadge : '!'}
                    </span>
                )}
            </Link>
        );
    };

    return (
        <div className="sidebar">
            <div className="s-logo">
                <Image src="/logo_black.png" alt="MSK Aesthetics By Dr. Salman" width={140} height={56} className="s-logo-img" priority />
            </div>

            <div className="s-nav-wrap">
                <div className="s-section">Overview</div>
                {navLink('/', 'Dashboard', <LayoutDashboard size={16} />, true)}
                {navLink('/stock', 'Stock Levels', <PackageSearch size={16} />)}
                {navLink('/analytics', 'Analytics', <BarChart3 size={16} />, true)}

                <div className="s-section">Transactions</div>
                {navLink('/sales', 'Sales Log', <ReceiptText size={16} />)}
                {navLink('/sales/add', 'Add Sale', <PlusCircle size={16} />)}
                {navLink('/restock', 'Restock', <Box size={16} />)}
                {navLink('/quotes', 'Quotes / Invoices', <FileText size={16} />)}

                {isAdmin && (
                    <>
                        <div className="s-section">Settings</div>
                        {navLink('/users', 'User Management', <Users size={16} />, true)}
                        {navLink('/config', 'Configuration', <Settings size={16} />, true)}
                    </>
                )}
            </div>

            <div className="user-pill">
                <div className={`avatar ${isAdmin ? 'admin-av' : 'avatar-manager'}`}>
                    {initial}
                </div>
                <div>
                    <div className="user-name">{user.name}</div>
                    <div className={`user-role ${isAdmin ? 'role-admin' : 'role-manager'}`}>
                        {isAdmin ? 'Administrator' : 'Inventory Manager'}
                    </div>
                </div>
                <button className="logout" onClick={handleLogout} title="Sign out">
                    <LogOut size={15} />
                </button>
            </div>
        </div>
    );
}