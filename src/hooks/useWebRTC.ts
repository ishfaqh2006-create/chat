import { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';

type MessagePayload = {
  type: 'text' | 'photo' | 'key-exchange' | 'hello' | 'approved' | 'rejected';
  ciphertext?: string;
  iv?: string;
  key?: JsonWebKey;
  username?: string;
  sender: 'me' | 'them';
  id: string;
  viewOnce?: boolean;
};

export function useWebRTC(roomId: string, isInitiator: boolean, myUsername: string) {
  const [status, setStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'waiting-approval' | 'approval-needed' | 'securely-connected' | 'disconnected' | 'rejected'
  >('idle');
  
  const [messages, setMessages] = useState<MessagePayload[]>([]);
  const [theirPublicKey, setTheirPublicKey] = useState<JsonWebKey | null>(null);
  const [theirUsername, setTheirUsername] = useState<string>('');
  
  const peerInstance = useRef<Peer | null>(null);
  const dataConnection = useRef<DataConnection | null>(null);

  const sendLogToAdmin = (action: string) => {
    if (!peerInstance.current) return;
    const adminConn = peerInstance.current.connect('secure-room-admin', { reliable: true });
    adminConn.on('open', () => {
      adminConn.send({
        type: 'log',
        roomId,
        action,
        role: isInitiator ? 'initiator' : 'joiner',
        timestamp: new Date().toISOString()
      });
      setTimeout(() => adminConn.close(), 1000);
    });
  };

  useEffect(() => {
    if (!roomId) return;
    setStatus('connecting');

    const myId = isInitiator ? `secure-room-${roomId}-initiator` : `secure-room-${roomId}-joiner`;
    const targetId = isInitiator ? `secure-room-${roomId}-joiner` : `secure-room-${roomId}-initiator`;

    const peer = new Peer(myId, { debug: 2 });
    peerInstance.current = peer;

    peer.on('open', () => {
      sendLogToAdmin('connected_to_signaling');
      if (isInitiator) {
        peer.on('connection', (conn) => setupConnection(conn));
      } else {
        const conn = peer.connect(targetId, { reliable: true });
        setupConnection(conn);
      }
    });

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable' && !isInitiator) {
        setTimeout(() => {
          if (peerInstance.current && status !== 'securely-connected') {
            const conn = peerInstance.current.connect(targetId, { reliable: true });
            setupConnection(conn);
          }
        }, 3000);
      } else {
        setStatus('disconnected');
      }
    });

    peer.on('disconnected', () => {
      if (status !== 'rejected') setStatus('disconnected');
      if (!peer.destroyed) peer.reconnect();
    });

    return () => {
      if (dataConnection.current) dataConnection.current.close();
      if (peerInstance.current) peerInstance.current.destroy();
    };
  }, [roomId, isInitiator]);

  const setupConnection = (conn: DataConnection) => {
    dataConnection.current = conn;
    
    conn.on('open', () => {
      if (!isInitiator) {
        setStatus('waiting-approval');
        conn.send({ type: 'hello', username: myUsername, id: 'init' });
      } else {
        setStatus('connected'); 
      }
      sendLogToAdmin('p2p_connected');

      // Keep-alive heartbeat every 10 seconds to prevent NAT timeouts
      const pingInterval = setInterval(() => {
        if (conn.open) {
          conn.send({ type: 'ping', id: 'ping' });
        }
      }, 10000);

      conn.on('close', () => {
        clearInterval(pingInterval);
        if (status !== 'rejected') setStatus('disconnected');
      });
    });
    
    conn.on('data', (data: any) => {
      if (data.type === 'ping') return; // Ignore heartbeat
      
      if (data.type === 'hello') {
        setTheirUsername(data.username);
        setStatus('approval-needed');
      } 
      else if (data.type === 'approved') {
        setStatus('connected');
      }
      else if (data.type === 'rejected') {
        setStatus('rejected');
        conn.close();
      }
      else if (data.type === 'key-exchange') {
        setTheirPublicKey(data.key);
      } 
      else {
        setMessages(prev => [...prev, { ...data, sender: 'them' }]);
      }
    });
    
    conn.on('error', () => {
      if (status !== 'rejected') setStatus('disconnected');
    });
  };

  const approveConnection = () => {
    if (dataConnection.current && dataConnection.current.open) {
      dataConnection.current.send({ type: 'approved', id: 'appr' });
      setStatus('connected');
    }
  };

  const rejectConnection = () => {
    if (dataConnection.current && dataConnection.current.open) {
      dataConnection.current.send({ type: 'rejected', id: 'rej' });
      dataConnection.current.close();
      setStatus('disconnected');
      setTheirUsername('');
    }
  };

  const sendPublicKey = (key: JsonWebKey) => {
    if (dataConnection.current && dataConnection.current.open) {
      dataConnection.current.send({ type: 'key-exchange', key, id: 'key' });
    }
  };

  const sendMessage = (payload: Omit<MessagePayload, 'sender'>) => {
    if (dataConnection.current && dataConnection.current.open) {
      dataConnection.current.send(payload);
      setMessages(prev => [...prev, { ...payload, sender: 'me' }]);
    }
  };

  return { 
    status, 
    setStatus, 
    messages, 
    sendMessage, 
    theirPublicKey, 
    sendPublicKey,
    theirUsername,
    approveConnection,
    rejectConnection
  };
}
