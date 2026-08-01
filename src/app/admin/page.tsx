"use client";

import { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';

type LogEntry = {
  id: string;
  timestamp: string;
  roomId: string;
  action: string;
  role: string;
};

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const peerInstance = useRef<Peer | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name === 'Ishfaq' && password === 'Ishfaq@11' && dob === '6102006') {
      setIsAuthenticated(true);
    } else {
      alert("Invalid Credentials");
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    // Connect to PeerJS as the Admin
    const peer = new Peer('secure-room-admin', { debug: 2 });
    peerInstance.current = peer;

    peer.on('open', (id) => {
      console.log('Admin connected to tracking server as:', id);
    });

    peer.on('connection', (conn: DataConnection) => {
      conn.on('data', (data: any) => {
        if (data && data.type === 'log') {
          setLogs(prev => [{
            id: Math.random().toString(36).substring(7),
            timestamp: data.timestamp,
            roomId: data.roomId,
            action: data.action,
            role: data.role
          }, ...prev].slice(0, 100)); // keep last 100 logs
        }
      });
    });

    return () => {
      if (peerInstance.current) peerInstance.current.destroy();
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <main className="container flex-center" style={{ flex: 1 }}>
        <form onSubmit={handleLogin} className="glass-panel animate-fade-in" style={{ maxWidth: '400px', width: '100%' }}>
          <h1 className="text-center" style={{ color: 'var(--danger)' }}>ADMIN ACCESS</h1>
          
          <div className="input-group">
            <label>Name</label>
            <input type="text" required className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          
          <div className="input-group">
            <label>Password</label>
            <input type="password" required className="input" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          
          <div className="input-group">
            <label>DOB (DDMMYYYY)</label>
            <input type="text" required className="input" value={dob} onChange={e => setDob(e.target.value)} />
          </div>

          <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem', background: 'var(--danger)' }}>
            LOGIN
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="container animate-fade-in">
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ color: 'var(--danger)' }}>LIVE ACTIVITY MONITOR</h1>
          <span className="badge" style={{ background: 'var(--danger)' }}>E2EE PROTECTED - METADATA ONLY</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--danger)' }}>
                <th style={{ padding: '1rem' }}>Timestamp</th>
                <th style={{ padding: '1rem' }}>Room ID</th>
                <th style={{ padding: '1rem' }}>Role</th>
                <th style={{ padding: '1rem' }}>Action Event</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Listening for live network activity...
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{log.roomId}</td>
                    <td style={{ padding: '1rem' }}>{log.role}</td>
                    <td style={{ padding: '1rem', color: 'var(--primary)' }}>{log.action}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
