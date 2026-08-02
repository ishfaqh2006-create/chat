"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

type UserRecordWithPassword = {
  id: string;
  username: string;
  fullName: string;
  password?: string;
  avatarColor: string;
  createdAt: string;
  lastSeen: number;
};

type AppStats = {
  totalUsers: number;
  maxUsers: number;
  totalMessages: number;
};

export default function AdminPage() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminName, setAdminName] = useState('Ishfaq');
  const [adminPassword, setAdminPassword] = useState('Ishfaq@11');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Admin Data State
  const [users, setUsers] = useState<UserRecordWithPassword[]>([]);
  const [stats, setStats] = useState<AppStats>({ totalUsers: 0, maxUsers: 20, totalMessages: 0 });
  const [newMaxUsers, setNewMaxUsers] = useState<number>(20);
  const [showPasswords, setShowPasswords] = useState(true);
  const [actionMessage, setActionMessage] = useState('');

  // 1. Admin Login Handler
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          adminName,
          adminPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Invalid Admin Credentials');
        return;
      }

      setIsAdminAuthenticated(true);
      setUsers(data.users || []);
      setStats(data.stats || { totalUsers: 0, maxUsers: 20, totalMessages: 0 });
      setNewMaxUsers(data.config?.maxUsers || 20);
    } catch (err) {
      setLoginError('Server connection error.');
    }
  };

  // 2. Refresh Admin Data
  const refreshAdminData = async () => {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          adminName,
          adminPassword
        })
      });

      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setStats(data.stats || { totalUsers: 0, maxUsers: 20, totalMessages: 0 });
      }
    } catch (err) {}
  };

  useEffect(() => {
    if (isAdminAuthenticated) {
      const interval = setInterval(refreshAdminData, 3000);
      return () => clearInterval(interval);
    }
  }, [isAdminAuthenticated, adminName, adminPassword]);

  // 3. Update Max Users Setting
  const handleUpdateMaxUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage('');

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateMaxUsers',
          adminName,
          adminPassword,
          maxUsers: newMaxUsers
        })
      });

      const data = await res.json();
      if (res.ok) {
        setActionMessage(`Success: ${data.message}`);
        setStats(prev => ({ ...prev, maxUsers: newMaxUsers }));
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setActionMessage('Failed to update max users setting.');
    }
  };

  // 4. Delete User Account
  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to delete user @${username}?`)) return;

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteUser',
          adminName,
          adminPassword,
          targetUserId: userId
        })
      });

      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        setActionMessage(`Deleted user @${username}`);
        refreshAdminData();
      }
    } catch (err) {}
  };

  // 5. Clear All Messages
  const handleClearAllMessages = async () => {
    if (!confirm('Are you sure you want to clear ALL chat history?')) return;

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clearMessages',
          adminName,
          adminPassword
        })
      });

      if (res.ok) {
        setActionMessage('All chat history cleared');
        refreshAdminData();
      }
    } catch (err) {}
  };

  // Login View
  if (!isAdminAuthenticated) {
    return (
      <div className="auth-overlay" suppressHydrationWarning>
        <div className="auth-card" suppressHydrationWarning>
          <div className="auth-header">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--wa-danger)">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8s0 0 0 0z"/>
            </svg>
            <h1 className="auth-title" style={{ color: 'var(--wa-danger)' }}>Admin Portal</h1>
            <p className="auth-subtitle">Login to manage users, passwords & max limit settings</p>
          </div>

          {loginError && <div className="error-banner">{loginError}</div>}

          <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} suppressHydrationWarning>
            <div className="form-group" suppressHydrationWarning>
              <label className="form-label">Admin Name</label>
              <input 
                type="text" 
                required 
                className="form-input" 
                value={adminName} 
                onChange={e => setAdminName(e.target.value)} 
                suppressHydrationWarning
              />
            </div>

            <div className="form-group" suppressHydrationWarning>
              <label className="form-label">Admin Password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type={showAdminPassword ? "text" : "password"} 
                  required 
                  className="form-input" 
                  style={{ width: '100%', paddingRight: '42px' }}
                  value={adminPassword} 
                  onChange={e => setAdminPassword(e.target.value)} 
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  style={{
                    position: 'absolute', right: '10px', background: 'transparent',
                    border: 'none', color: 'var(--wa-text-secondary)', cursor: 'pointer', fontSize: '16px'
                  }}
                  title={showAdminPassword ? "Hide password" : "Show password"}
                >
                  {showAdminPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ background: 'var(--wa-danger)', marginTop: '8px' }} suppressHydrationWarning>
              ACCESS ADMIN DASHBOARD
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <Link href="/" style={{ color: 'var(--wa-text-secondary)', fontSize: '13px' }}>
              ← Return to szchat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Admin Dashboard
  return (
    <div className="admin-container">
      {/* Header */}
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--wa-primary)' }}>szchat Admin Portal</h1>
          <p style={{ color: 'var(--wa-text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Registered Users, Passwords & System Configurations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/" className="btn-primary" style={{ textDecoration: 'none', padding: '8px 16px', fontSize: '13px' }}>
            Open szchat App
          </Link>
          <button className="btn-primary" style={{ background: 'var(--wa-header-dark)', color: '#fff', padding: '8px 16px', fontSize: '13px' }} onClick={() => setIsAdminAuthenticated(false)}>
            Exit Admin
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="error-banner" style={{ background: 'rgba(0, 168, 132, 0.15)', borderColor: 'var(--wa-primary)', color: 'var(--wa-primary)', marginBottom: '20px' }}>
          {actionMessage}
        </div>
      )}

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <span style={{ color: 'var(--wa-text-secondary)', fontSize: '12px', fontWeight: '600' }}>TOTAL USERS</span>
          <h2 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--wa-primary)', marginTop: '4px' }}>{stats.totalUsers}</h2>
        </div>
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <span style={{ color: 'var(--wa-text-secondary)', fontSize: '12px', fontWeight: '600' }}>MAX USERS LIMIT</span>
          <h2 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--wa-accent-yellow)', marginTop: '4px' }}>{stats.maxUsers}</h2>
        </div>
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <span style={{ color: 'var(--wa-text-secondary)', fontSize: '12px', fontWeight: '600' }}>TOTAL MESSAGES SENT</span>
          <h2 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--wa-tick-blue)', marginTop: '4px' }}>{stats.totalMessages}</h2>
        </div>
      </div>

      {/* Max Users Configuration Card */}
      <div className="admin-card">
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>⚙️ Manage Max Users Limit</h3>
        <p style={{ color: 'var(--wa-text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
          Decide the maximum number of users allowed to sign up. When this limit is reached, new user registrations will be automatically blocked.
        </p>

        <form onSubmit={handleUpdateMaxUsers} style={{ display: 'flex', gap: '12px', maxWidth: '400px' }}>
          <input 
            type="number" 
            min="1" 
            max="1000" 
            className="form-input" 
            style={{ flex: 1 }} 
            value={newMaxUsers} 
            onChange={e => setNewMaxUsers(parseInt(e.target.value, 10) || 1)}
          />
          <button type="submit" className="btn-primary" style={{ padding: '10px 20px', fontSize: '14px' }}>
            Save Max Limit
          </button>
        </form>
      </div>

      {/* User Records Table */}
      <div className="admin-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600' }}>👥 All Registered Users & Passwords</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="badge-tag" 
              style={{ cursor: 'pointer', background: showPasswords ? 'var(--wa-primary)' : 'var(--wa-header-dark)', color: showPasswords ? '#000' : '#fff' }}
              onClick={() => setShowPasswords(!showPasswords)}
            >
              {showPasswords ? 'Hide Passwords' : 'Show Passwords'}
            </button>
            <button className="badge-tag" style={{ cursor: 'pointer', background: 'var(--wa-danger)', color: '#fff' }} onClick={handleClearAllMessages}>
              Clear Chat History
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User Avatar</th>
                <th>Full Name</th>
                <th>Username</th>
                <th>User Password</th>
                <th>Created At</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--wa-text-muted)' }}>
                    No users registered yet. Users will appear here after sign up.
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="avatar sm" style={{ backgroundColor: u.avatarColor }}>
                        {u.fullName.charAt(0)}
                      </div>
                    </td>
                    <td style={{ fontWeight: '600' }}>{u.fullName}</td>
                    <td style={{ color: 'var(--wa-primary)' }}>@{u.username}</td>
                    <td>
                      <span className="badge-tag" style={{ color: 'var(--wa-accent-yellow)' }}>
                        {showPasswords ? u.password : '••••••••'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--wa-text-muted)', fontSize: '12px' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ color: 'var(--wa-text-muted)', fontSize: '12px' }}>
                      {new Date(u.lastSeen).toLocaleTimeString()}
                    </td>
                    <td>
                      <button 
                        style={{
                          background: 'rgba(234, 67, 53, 0.2)', border: '1px solid var(--wa-danger)', 
                          color: '#ff8f8f', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
                        }}
                        onClick={() => handleDeleteUser(u.id, u.username)}
                      >
                        Delete
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
