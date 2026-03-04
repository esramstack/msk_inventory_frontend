'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BACKEND_URL } from '@/lib/config';
import { useAuth } from '@/components/AuthProvider';

export default function Login() {
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { refreshAuth } = useAuth();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const form = new FormData(e.currentTarget);
        const email = form.get('email');
        const password = form.get('password');

        try {
            const res = await fetch(`${BACKEND_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Login failed.');
            } else {
                await refreshAuth();
                // Manager should go to stock levels, admin to dashboard
                if (data.user?.role === 'manager') {
                    router.push('/stock');
                } else {
                    router.push('/');
                }
            }
        } catch (err) {
            setError('Network error connecting to backend.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div id="auth">
            <div className="auth-left">
                <div className="auth-grid"></div>
                <div className="o1 orb"></div>
                <div className="o2 orb"></div>
                <div className="o3 orb"></div>

                <div className="auth-brand relative z-[2]">
                    <Image
                        src="/logo_black.png"
                        alt="MSK Aesthetics By Dr. Salman"
                        width={220}
                        height={180}
                        priority
                    />
                    <div className="auth-tagline">MSK Aesthetics Inventory Management — precision in every unit.</div>
                </div>

                <div className="auth-feats">
                    <div className="auth-feat"><div className="feat-dot"></div><span className="feat-text">Real-time stock tracking across 6 products</span></div>
                    <div className="auth-feat"><div className="feat-dot"></div><span className="feat-text">Multi-channel &amp; multi-branch sales logging</span></div>
                    <div className="auth-feat"><div className="feat-dot"></div><span className="feat-text">Automated reorder &amp; low-stock alerts</span></div>
                    <div className="auth-feat"><div className="feat-dot"></div><span className="feat-text">Full configuration — products, channels, cities</span></div>
                </div>
            </div>

            <div className="auth-right">
                <div className="auth-wrap">
                    <div className="auth-title">Welcome back</div>
                    <div className="auth-sub">Sign in to your MSK Aesthetics workspace</div>

                    <div className={`auth-err ${error ? 'show' : ''}`} id="login-err">
                        {error}
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="auth-field">
                            <label>Email address</label>
                            <div className="auth-inp-wrap">
                                <Mail className="inp-icon" size={16} />
                                <input
                                    className="auth-inp"
                                    type="email"
                                    name="email"
                                    placeholder="you@mskaesthetics.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="auth-field">
                            <label>Password</label>
                            <div className="auth-inp-wrap">
                                <svg className="inp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                <input
                                    className="auth-inp"
                                    type={showPass ? "text" : "password"}
                                    name="password"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    className="inp-toggle"
                                    onClick={() => setShowPass(!showPass)}
                                    tabIndex={-1}
                                >
                                    {showPass ? <Eye size={16} /> : <EyeOff size={16} />}
                                </button>
                            </div>
                        </div>

                        <button type="submit" className="auth-btn" disabled={loading}>
                            {loading ? 'Verifying...' : 'Sign In'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
