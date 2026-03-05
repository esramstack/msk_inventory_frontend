'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getActivityLogs } from '@/api/quotes';
import { getUsers, createUser, deleteUser, updateUserPassword } from '@/api/users';
import { ActivityLog, User } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function UserManagement() {
    const { user: currentUser } = useAuth();
    const router = useRouter();

    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter Logs State
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedUser, setSelectedUser] = useState('all');
    const [selectedType, setSelectedType] = useState('all');

    // Add User State
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPass, setNewPass] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'manager'>('manager');

    // Change Pass State
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [changePass, setChangePass] = useState('');
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (currentUser && currentUser.role !== 'admin') {
            router.push('/stock');
            return;
        }

        async function load() {
            try {
                const [l, u] = await Promise.all([
                    getActivityLogs(dateFrom, dateTo),
                    getUsers()
                ]);
                setLogs(l || []);
                setUsers(u || []);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [currentUser, router, dateFrom, dateTo]);

    const handleAddUser = async () => {
        if (!newName || !newEmail || !newPass) return alert('Fill all fields');
        try {
            await createUser({ name: newName, email: newEmail, password: newPass, role: newRole });
            const u = await getUsers();
            setUsers(u);
            setShowAdd(false);
            setNewName(''); setNewEmail(''); setNewPass('');
        } catch (e) {
            alert('Failed to add user');
        }
    };

    const handleDelete = (id: string, name: string) => {
        setPendingDeleteId(id);
        setPendingDeleteName(name);
    };

    const confirmDelete = async () => {
        if (!pendingDeleteId) return;
        setDeleting(true);
        try {
            await deleteUser(pendingDeleteId);
            const u = await getUsers();
            setUsers(u);
            setPendingDeleteId(null);
            setPendingDeleteName(null);
        } catch (e) {
            alert('Failed to delete user');
        } finally {
            setDeleting(false);
        }
    };

    const handleUpdatePass = async () => {
        if (!editingUserId || !changePass) return;
        try {
            await updateUserPassword(editingUserId, changePass);
            setEditingUserId(null);
            setChangePass('');
            alert('Password updated successfully');
        } catch (e) {
            alert('Failed to update password');
        }
    };

    const filteredLogs = logs.filter(l => {
        if (selectedUser !== 'all' && l.user_name !== selectedUser) return false;
        if (selectedType !== 'all' && l.type !== selectedType) return false;
        return true;
    });

    if (loading || !currentUser || currentUser.role !== 'admin') {
        return <div className="p-8 text-center text-[var(--text3)]">Loading user profiles...</div>;
    }

    return (
        <div className="page active" id="page-users">
            <div className="ph">
                <div>
                    <h1>User Management</h1>
                    <p>Manage system profiles & audit activity history</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
                    <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
                    New Profile
                </button>
            </div>

            <div className="top-grid" style={{ marginBottom: '24px' }}>
                <div className="card">
                    <div className="card-title">System Profiles</div>
                    <div className="rank-list" style={{ padding: '0' }}>
                        {users.map((u) => (
                            <div className="rank-item" key={u.id} style={{ padding: '12px 0' }}>
                                <div className={`rank-num ${u.role === 'admin' ? 'r1' : 'r3'}`} style={{ fontSize: '10px' }}>
                                    {u.role.toUpperCase()[0]}
                                </div>
                                <div className="rank-info">
                                    <div className="rank-name">{u.name}</div>
                                    <div className="rank-sub">{u.email} • <span className={`badge ${u.role === 'admin' ? 'b-gold' : 'b-blue'}`} style={{ fontSize: '9px' }}>{u.role.toUpperCase()}</span></div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn-icon" title="Change Password" onClick={() => setEditingUserId(u.id)}>
                                        <svg viewBox="0 0 24 24" width="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                                    </button>
                                    <button className="btn-icon text-red" title="Delete Account" onClick={() => handleDelete(u.id, u.name)}>
                                        <svg viewBox="0 0 24 24" width="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <div className="card-title">Account Quick Actions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px' }}>
                        <div style={{ background: 'var(--surface2)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid var(--gold)' }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Security Audit Required</div>
                            <p style={{ fontSize: '11.5px', color: 'var(--text3)', margin: 0 }}>Review accounts regularly. Disable profiles for former employees immediately.</p>
                        </div>
                        <div style={{ background: 'var(--surface2)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid var(--blue)' }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Password Policy</div>
                            <p style={{ fontSize: '11.5px', color: 'var(--text3)', margin: 0 }}>Ensure all managers use complex passwords (min 8 chars).</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals Inlined for simplicity as per project style */}
            {showAdd && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card modal-card">
                        <div className="card-title">Create New Profile</div>
                        <div className="fg"><label>Full Name</label><input type="text" value={newName} onChange={e => setNewName(e.target.value)} /></div>
                        <div className="fg"><label>Email Address</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} /></div>
                        <div className="fg"><label>Initial Password</label><input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} /></div>
                        <div className="fg">
                            <label>System Role</label>
                            <select value={newRole} onChange={e => setNewRole(e.target.value as any)}>
                                <option value="manager">Manager</option>
                                <option value="admin">Administrator</option>
                            </select>
                        </div>
                        <div className="btn-row" style={{ marginTop: '20px' }}>
                            <button className="btn btn-primary" onClick={handleAddUser}>Create Profile</button>
                            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {editingUserId && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div className="card modal-card">
                        <div className="card-title">Update Password</div>
                        <div className="fg"><label>New Security Password</label><input type="password" value={changePass} onChange={e => setChangePass(e.target.value)} /></div>
                        <div className="btn-row" style={{ marginTop: '20px' }}>
                            <button className="btn btn-primary" onClick={handleUpdatePass}>Update Password</button>
                            <button className="btn btn-secondary" onClick={() => setEditingUserId(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={!!pendingDeleteId}
                title="Delete user profile"
                message={pendingDeleteName ? (
                    <>This will permanently remove <strong>{pendingDeleteName}</strong> from the system. This cannot be undone.</>
                ) : null}
                confirmLabel="Delete profile"
                cancelLabel="Cancel"
                confirming={deleting}
                onConfirm={confirmDelete}
                onCancel={() => !deleting && (setPendingDeleteId(null), setPendingDeleteName(null))}
            />

            <div className="card">
                <div className="card-title">Detailed Activity Audit</div>

                <div className="users-filter-bar" style={{ display: 'flex', gap: '15px', marginBottom: '20px', padding: '15px', background: 'var(--surface2)', borderRadius: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="users-filter-daterange" style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Range</label>
                        <div className="users-filter-daterange-inner" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="date" className="dfinput" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px', borderRadius: '6px', color: 'var(--text)' }} />
                            <span style={{ color: 'var(--text3)' }}>to</span>
                            <input type="date" className="dfinput" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px', borderRadius: '6px', color: 'var(--text)' }} />
                        </div>
                    </div>

                    <div style={{ flex: '1 1 150px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter by User</label>
                        <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px', borderRadius: '6px', color: 'var(--text)' }}>
                            <option value="all">All Users</option>
                            {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                        </select>
                    </div>

                    <div style={{ flex: '1 1 150px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter by Type</label>
                        <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px', borderRadius: '6px', color: 'var(--text)' }}>
                            <option value="all">All Activities</option>
                            <option value="auth">Logins</option>
                            <option value="add">Added</option>
                            <option value="del">Deleted</option>
                            <option value="edit">Edited</option>
                            <option value="pw">Password Updates</option>
                        </select>
                    </div>

                    <button className="btn btn-secondary" onClick={() => { setDateFrom(''); setDateTo(''); setSelectedUser('all'); setSelectedType('all'); }} style={{ height: '38px', whiteSpace: 'nowrap' }}>RESET FILTERS</button>
                </div>

                <div className="tbl-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>User</th>
                                <th>Role</th>
                                <th>Action</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map((log) => (
                                <tr key={log.id}>
                                    <td className="text-dimmed" style={{ fontSize: '12px' }}>{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
                                    <td style={{ fontWeight: 600 }}>{log.user_name}</td>
                                    <td><span className={`badge ${log.role === 'admin' ? 'b-gold' : 'b-blue'}`}>{log.role}</span></td>
                                    <td>
                                        <span className={`badge ${log.type === 'add' ? 'b-green' : log.type === 'del' ? 'b-red' : log.type === 'auth' ? 'b-gold' : 'b-blue'}`}>
                                            {log.type.toUpperCase()}
                                        </span>
                                    </td>
                                    <td dangerouslySetInnerHTML={{ __html: log.message }}></td>
                                </tr>
                            ))}
                            {filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-[var(--text3)]">No activity matches your filters</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
