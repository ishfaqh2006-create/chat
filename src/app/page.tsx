"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  generateKeyPair, exportPublicKey, importPublicKey, deriveSharedKey, 
  generateSecurityFingerprint, encryptData, decryptData 
} from '@/lib/crypto';
import { useWebRTC } from '@/hooks/useWebRTC';

type Message = {
  id: string;
  text?: string;
  photo?: string;
  sender: 'me' | 'them';
  viewOnce?: boolean;
};

export default function App() {
  const [username, setUsername] = useState('');
  const [passkey, setPasskey] = useState('');
  const [role, setRole] = useState<'initiator' | 'joiner' | null>(null);
  
  const [myKeyPair, setMyKeyPair] = useState<CryptoKeyPair | null>(null);
  const [sharedAesKey, setSharedAesKey] = useState<CryptoKey | null>(null);
  const [fingerprint, setFingerprint] = useState<string>('');
  
  const [roomId, setRoomId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  
  const [viewOnceMode, setViewOnceMode] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const { 
    status, setStatus, messages: encryptedMessages, sendMessage, 
    theirPublicKey, sendPublicKey, theirUsername, approveConnection, rejectConnection
  } = useWebRTC(roomId, role === 'initiator', username);

  const handleConnect = async (selectedRole: 'initiator' | 'joiner') => {
    if (!username.trim()) {
      alert("Please enter a username.");
      return;
    }
    if (!passkey || passkey.length < 4) {
      alert("Passkey must be at least 4 characters.");
      return;
    }
    
    const enc = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(passkey));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const keyPair = await generateKeyPair();
    setMyKeyPair(keyPair);
    setRoomId(hashHex.substring(0, 16));
    setRole(selectedRole);
  };

  useEffect(() => {
    if (status === 'connected' && myKeyPair) {
      exportPublicKey(myKeyPair.publicKey).then(sendPublicKey);
    }
  }, [status, myKeyPair]);

  useEffect(() => {
    const establishSecureConnection = async () => {
      if (theirPublicKey && myKeyPair) {
        const importedTheirKey = await importPublicKey(theirPublicKey);
        const derivedKey = await deriveSharedKey(myKeyPair.privateKey, importedTheirKey);
        setSharedAesKey(derivedKey);
        
        const myJwk = await exportPublicKey(myKeyPair.publicKey);
        const fp = await generateSecurityFingerprint(myJwk, theirPublicKey);
        setFingerprint(fp);
        
        setStatus('securely-connected');
      }
    };
    establishSecureConnection();
  }, [theirPublicKey, myKeyPair]);

  useEffect(() => {
    const processIncoming = async () => {
      if (!sharedAesKey || encryptedMessages.length === 0) return;
      
      const latestMsg = encryptedMessages[encryptedMessages.length - 1];
      if (latestMsg.sender === 'them' && latestMsg.ciphertext && latestMsg.iv) {
        try {
          const decrypted = await decryptData(sharedAesKey, latestMsg.ciphertext, latestMsg.iv);
          setChatMessages(prev => [...prev, {
            id: latestMsg.id,
            text: latestMsg.type === 'text' ? decrypted : undefined,
            photo: latestMsg.type === 'photo' ? decrypted : undefined,
            sender: 'them',
            viewOnce: latestMsg.viewOnce
          }]);
        } catch (e) {
          console.error("Decryption failed");
        }
      }
    };
    processIncoming();
  }, [encryptedMessages, sharedAesKey]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !sharedAesKey || status !== 'securely-connected') return;

    const textToSend = inputText;
    setInputText('');

    const { ciphertext, iv } = await encryptData(sharedAesKey, textToSend);
    const msgId = Math.random().toString(36).substr(2, 9);
    
    sendMessage({ type: 'text', ciphertext, iv, id: msgId });
    setChatMessages(prev => [...prev, { id: msgId, text: textToSend, sender: 'me' }]);
  };

  const handleFilePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sharedAesKey || status !== 'securely-connected') return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      await encryptAndSendPhoto(base64);
    };
    reader.readAsDataURL(file);
  };

  const encryptAndSendPhoto = async (base64: string) => {
    if (!sharedAesKey) return;
    const { ciphertext, iv } = await encryptData(sharedAesKey, base64);
    const msgId = Math.random().toString(36).substr(2, 9);
    
    sendMessage({ type: 'photo', ciphertext, iv, id: msgId, viewOnce: viewOnceMode });
    setChatMessages(prev => [...prev, { id: msgId, photo: base64, sender: 'me', viewOnce: viewOnceMode }]);
    setViewOnceMode(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      alert("Camera access denied or unavailable.");
    }
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    
    const stream = videoRef.current.srcObject as MediaStream;
    stream.getTracks().forEach(track => track.stop());
    setCameraActive(false);

    encryptAndSendPhoto(base64);
  };

  if (!role) {
    return (
      <main className="container flex-center" style={{ flex: 1 }}>
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '400px', width: '100%' }}>
          <h1 className="text-center">Secure E2EE Chat</h1>
          <p className="text-center text-muted mb-4">Enter a username and passkey to connect securely.</p>
          
          <div className="input-group">
            <label>Username</label>
            <input 
              type="text" 
              className="input" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              placeholder="Your name"
            />
          </div>

          <div className="input-group">
            <label>Passkey</label>
            <input 
              type="password" 
              className="input" 
              value={passkey} 
              onChange={e => setPasskey(e.target.value)} 
              placeholder="e.g. secret123"
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => handleConnect('initiator')}>Host Room</button>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => handleConnect('joiner')}>Join Room</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="chat-container glass-panel animate-fade-in">
      <div className="chat-header">
        <div>
          <h2>Private Chat</h2>
          {status === 'securely-connected' ? (
            <div className="badge success">SECURE | Fingerprint: {fingerprint}</div>
          ) : status === 'rejected' ? (
            <div className="badge danger">Connection Rejected</div>
          ) : (
            <div className="badge danger">Status: {status}</div>
          )}
        </div>
      </div>

      {cameraActive && (
        <div className="camera-overlay">
          <video ref={videoRef} autoPlay playsInline />
          <button className="btn camera-btn" onClick={takePhoto}>📸 Snap</button>
          <button className="btn camera-cancel" onClick={() => setCameraActive(false)}>Cancel</button>
        </div>
      )}

      <div className="chat-messages">
        {status === 'waiting-approval' && (
          <div className="text-center text-muted mt-4">
            <p>Waiting for the host to approve your connection...</p>
          </div>
        )}

        {status === 'approval-needed' && (
          <div className="text-center mt-4">
            <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>{theirUsername} is trying to join.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="btn" style={{ background: 'var(--success)' }} onClick={approveConnection}>Approve</button>
              <button className="btn" style={{ background: 'var(--danger)' }} onClick={rejectConnection}>Reject</button>
            </div>
          </div>
        )}

        {status === 'rejected' && (
          <div className="text-center text-muted mt-4">
            <p style={{ color: 'var(--danger)' }}>The host rejected your connection request.</p>
            <button className="btn mt-4" onClick={() => window.location.reload()}>Go Back</button>
          </div>
        )}

        {chatMessages.map(msg => (
          <div key={msg.id} className={`message ${msg.sender === 'me' ? 'message-mine' : 'message-theirs'}`}>
            {msg.text && <p>{msg.text}</p>}
            
            {msg.photo && msg.viewOnce && !(msg as any).revealed && msg.sender === 'them' && (
              <button className="btn" onClick={() => {
                setChatMessages(prev => prev.map(m => m.id === msg.id ? { ...m, revealed: true } : m));
                setTimeout(() => setChatMessages(prev => prev.filter(m => m.id !== msg.id)), 3000);
              }}>⏱️ View Once</button>
            )}
            
            {msg.photo && msg.viewOnce && msg.sender === 'me' && (
              <div className="text-muted">⏱️ View-once photo sent</div>
            )}

            {msg.photo && (!msg.viewOnce || (msg as any).revealed) && (
              <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                <img src={msg.photo} alt="Shared photo" className="image-preview" />
                {!msg.viewOnce && (
                  <a 
                    href={msg.photo} 
                    download={`secure-photo-${msg.id}.jpg`}
                    className="btn icon-btn" 
                    style={{ position: 'absolute', bottom: '1rem', right: '1rem', padding: '0.5rem', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', color: 'white' }}
                    title="Download Photo"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={chatBottomRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSendText}>
        <div className="media-controls">
          <button type="button" className={`btn icon-btn ${viewOnceMode ? 'view-once-active' : ''}`} onClick={() => setViewOnceMode(!viewOnceMode)} disabled={status !== 'securely-connected'} title="View Once Mode">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </button>
          <button type="button" className="btn icon-btn" onClick={startCamera} disabled={status !== 'securely-connected'} title="Camera">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          </button>
          <label className="btn icon-btn" style={{ opacity: status !== 'securely-connected' ? 0.5 : 1, cursor: 'pointer' }} title="Gallery">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFilePhoto} disabled={status !== 'securely-connected'} />
          </label>
        </div>
        
        <input 
          type="text" 
          className="input" 
          placeholder="Encrypted message..." 
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          disabled={status !== 'securely-connected'}
        />
        <button type="submit" className="btn" disabled={status !== 'securely-connected' || !inputText.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
