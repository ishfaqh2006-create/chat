"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { DisappearingOption } from '@/lib/db';
import { getSymmetricKeyForPair, encryptE2EE, decryptE2EE } from '@/lib/crypto';

type UserProfile = {
  id: string;
  username: string;
  fullName: string;
  avatarColor: string;
  createdAt: string;
  lastSeen: number;
  statusMessage?: string;
  isOnline?: boolean;
  lastMessage?: MessageItem;
  unreadCount?: number;
};

type MessageItem = {
  id: string;
  senderId: string;
  receiverId: string;
  text?: string;
  fileUrl?: string;
  fileType?: 'image' | 'audio' | 'document';
  ciphertext?: string;
  iv?: string;
  encrypted?: boolean;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  viewOnce?: boolean;
  viewOnceOpened?: boolean;
  disappearingOption?: DisappearingOption;
  expiresAt?: number;
  deletedFor?: string[];
  // Reply-to fields
  replyToId?: string;
  replyToText?: string;
  replyToSender?: string;
  isOptimistic?: boolean; // client-only flag for instant UI
};

const POPULAR_EMOJIS = ['😊', '😂', '😍', '👍', '❤️', '🔥', '🎉', '🙏', '👏', '💯', '🚀', '✨', '😎', '🤣', '😭', '🙌', '🤝', '🥳'];

const DISAPPEARING_LABELS: Record<DisappearingOption, string> = {
  off: 'Off',
  view_once: 'View Once',
  '1h': '1 Hour',
  '24h': '24 Hours',
  '7d': '7 Days'
};

export default function SZChatApp() {
  // Auth State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // App & Database Provider State
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [activeContact, setActiveContact] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [decryptedTexts, setDecryptedTexts] = useState<Record<string, string>>({});
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [dbProvider, setDbProvider] = useState<string>('MongoDB Atlas');

  // Disappearing & Media State
  const [disappearingOption, setDisappearingOption] = useState<DisappearingOption>('off');
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showCamera, setShowCamera] = useState(false);

  // Add Contact Modal State
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [contactSearchInput, setContactSearchInput] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<(UserProfile & { isAdded?: boolean })[]>([]);
  const [addContactMessage, setAddContactMessage] = useState('');

  // Settings Drawer State
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editStatusMessage, setEditStatusMessage] = useState('');
  const [profileSaveMessage, setProfileSaveMessage] = useState('');

  // Selected Message Menu State
  const [selectedMessageMenuId, setSelectedMessageMenuId] = useState<string | null>(null);

  // Reply State
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; senderName: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Typing debounce ref (prevents spamming the typing API)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mobile View & Hydration Guard
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Refs for State Diffing & Scroll Lock
  const contactsRef = useRef<UserProfile[]>([]);
  const messagesRef = useRef<MessageItem[]>([]);
  // Track which message IDs have already been decrypted (avoid re-decrypting)
  const decryptedIdsRef = useRef<Set<string>>(new Set());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep refs in sync with state for diffing
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // 1. Restore Session & Hydration Check
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('szchat_user_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) {
          setCurrentUser(parsed);
          setEditFullName(parsed.fullName || '');
          setEditStatusMessage(parsed.statusMessage || 'Hey there! I am using szchat.');
        }
      } catch (e) {
        localStorage.removeItem('szchat_user_session');
      }
    }
  }, []);

  // 2. Browser & Native Phone Hardware Back Button (popstate) Navigation
  useEffect(() => {
    const handlePopState = () => {
      if (showMobileChat || activeContact) {
        setShowMobileChat(false);
        setActiveContact(null);
      } else if (showSettingsDrawer) {
        setShowSettingsDrawer(false);
      } else if (showAddContactModal) {
        setShowAddContactModal(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showMobileChat, activeContact, showSettingsDrawer, showAddContactModal]);

  const selectContactWithHistory = (contact: UserProfile) => {
    setActiveContact(contact);
    setShowMobileChat(true);
    if (typeof window !== 'undefined') {
      window.history.pushState({ chatOpen: true }, '');
    }
  };

  const closeMobileChatWithHistory = () => {
    setShowMobileChat(false);
    setActiveContact(null);
  };

  // 3. Auth Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const payload = authMode === 'login' 
      ? { username: authUsername, password: authPassword }
      : { username: authUsername, fullName: authFullName, password: authPassword };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        setAuthLoading(false);
        return;
      }

      setCurrentUser(data.user);
      setEditFullName(data.user.fullName || '');
      setEditStatusMessage(data.user.statusMessage || 'Hey there! I am using szchat.');
      localStorage.setItem('szchat_user_session', JSON.stringify(data.user));
      setAuthUsername('');
      setAuthPassword('');
      setAuthFullName('');
    } catch (err) {
      setAuthError('Connection error. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('szchat_user_session');
    setCurrentUser(null);
    setActiveContact(null);
    setMessages([]);
    setShowMobileChat(false);
  };

  // 4. Contacts Polling — 3s is enough; contacts don't change that fast
  useEffect(() => {
    if (!currentUser) return;

    const fetchContacts = async () => {
      try {
        const res = await fetch(`/api/users?userId=${currentUser.id}`);
        if (res.ok) {
          const data = await res.json();
          const newContacts: UserProfile[] = data.users || [];
          if (data.dbProvider) setDbProvider(data.dbProvider);

          // Shallow diff — only re-render if data actually changed
          if (JSON.stringify(contactsRef.current) !== JSON.stringify(newContacts)) {
            setContacts(newContacts);
          }
        }
      } catch (_) {
      } finally {
        setContactsLoading(false);
      }
    };

    fetchContacts();
    const interval = setInterval(fetchContacts, 3000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // 5. Poll Messages — 800ms for near-real-time feel; only decrypt NEW messages
  useEffect(() => {
    if (!currentUser || !activeContact) return;

    // Reset decryption cache when conversation changes
    decryptedIdsRef.current = new Set();

    const fetchConversation = async () => {
      try {
        const msgRes = await fetch(`/api/messages?userId=${currentUser.id}&peerId=${activeContact.id}`);
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const rawMsgs: MessageItem[] = msgData.messages || [];

          // Diff by last message id + count to avoid full stringify
          const prevLast = messagesRef.current[messagesRef.current.length - 1]?.id;
          const newLast = rawMsgs[rawMsgs.length - 1]?.id;
          const prevCount = messagesRef.current.filter(m => !m.isOptimistic).length;

          if (prevLast !== newLast || prevCount !== rawMsgs.length) {
            // Replace optimistic messages with server-confirmed ones
            setMessages(rawMsgs);

            // Only decrypt messages we haven't seen yet
            const key = await getSymmetricKeyForPair(currentUser.id, activeContact.id);
            const newDecrypted: Record<string, string> = {};
            let hasNew = false;

            for (const m of rawMsgs) {
              if (!decryptedIdsRef.current.has(m.id)) {
                hasNew = true;
                decryptedIdsRef.current.add(m.id);
                if (m.ciphertext && m.iv) {
                  try {
                    newDecrypted[m.id] = await decryptE2EE(key, m.ciphertext, m.iv);
                  } catch {
                    newDecrypted[m.id] = m.text || '[Encrypted]';
                  }
                } else if (m.text) {
                  newDecrypted[m.id] = m.text;
                }
              }
            }
            if (hasNew) setDecryptedTexts(prev => ({ ...prev, ...newDecrypted }));
          } else {
            // Same messages — only update status ticks (no re-render of bubbles)
            const prevStatuses = messagesRef.current.map(m => m.status).join();
            const newStatuses = rawMsgs.map((m: MessageItem) => m.status).join();
            if (prevStatuses !== newStatuses) {
              setMessages(rawMsgs);
            }
          }
        }

        // Fetch typing separately — it's cheap
        const typeRes = await fetch(`/api/typing?userId=${currentUser.id}&peerId=${activeContact.id}`);
        if (typeRes.ok) {
          const typeData = await typeRes.json();
          setIsPeerTyping(typeData.isTyping);
        }
      } catch (_) {}
    };

    fetchConversation();
    const interval = setInterval(fetchConversation, 800);
    return () => clearInterval(interval);
  }, [currentUser, activeContact]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isPeerTyping]);

  // 6. Typing Signal — debounced to avoid API spam
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!currentUser || !activeContact) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (text.trim().length > 0) {
      fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, typingTo: activeContact.id }),
      }).catch(() => {});
      // Auto-clear typing after 3s of no input
      typingTimeoutRef.current = setTimeout(() => {
        fetch('/api/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, typingTo: null }),
        }).catch(() => {});
      }, 3000);
    } else {
      fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, typingTo: null }),
      }).catch(() => {});
    }
  };

  // 7. Send Message — OPTIMISTIC UI (instant) + reply support
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !currentUser || !activeContact) return;

    const textToSend = inputText.trim();
    const currentReplyTo = replyTo;

    // Clear input & reply bar immediately (feels instant)
    setInputText('');
    setReplyTo(null);
    setShowEmojiPicker(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // ── OPTIMISTIC: add to UI right now with a temp id ──
    const optimisticId = 'opt_' + Date.now();
    const optimisticMsg: MessageItem = {
      id: optimisticId,
      senderId: currentUser.id,
      receiverId: activeContact.id,
      text: textToSend,
      timestamp: Date.now(),
      status: 'sent',
      isOptimistic: true,
      replyToId: currentReplyTo?.id,
      replyToText: currentReplyTo?.text,
      replyToSender: currentReplyTo?.senderName,
    };
    setMessages(prev => [...prev.filter(m => !m.isOptimistic || m.id !== optimisticId), optimisticMsg]);
    setDecryptedTexts(prev => ({ ...prev, [optimisticId]: textToSend }));

    fetch('/api/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, typingTo: null }),
    }).catch(() => {});

    try {
      const aesKey = await getSymmetricKeyForPair(currentUser.id, activeContact.id);
      const { ciphertext, iv } = await encryptE2EE(aesKey, textToSend);

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: activeContact.id,
          ciphertext,
          iv,
          disappearingOption,
          viewOnce: disappearingOption === 'view_once',
          replyToId: currentReplyTo?.id,
          replyToText: currentReplyTo?.text,
          replyToSender: currentReplyTo?.senderName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Replace optimistic message with server-confirmed one
        setMessages(prev => prev.map(m => m.id === optimisticId ? { ...data.message } : m));
        setDecryptedTexts(prev => ({ ...prev, [data.message.id]: textToSend }));
        decryptedIdsRef.current.add(data.message.id);
      } else {
        // Remove failed optimistic message
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
    }
  };

  // Helper to start replying to a message
  const handleReply = (msg: MessageItem, senderName: string) => {
    const text = decryptedTexts[msg.id] || msg.text || (msg.fileType === 'image' ? '📷 Photo' : msg.fileType === 'audio' ? '🎤 Voice note' : '[message]');
    setReplyTo({ id: msg.id, text, senderName });
    setSelectedMessageMenuId(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // 8. Image & Media Attachments
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || !activeContact) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      await sendMediaMessage(base64, 'image');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const sendMediaMessage = async (fileUrl: string, fileType: 'image' | 'audio') => {
    if (!currentUser || !activeContact) return;

    try {
      const aesKey = await getSymmetricKeyForPair(currentUser.id, activeContact.id);
      const { ciphertext, iv } = await encryptE2EE(aesKey, fileUrl);

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: activeContact.id,
          fileType,
          ciphertext,
          iv,
          disappearingOption: disappearingOption,
          viewOnce: disappearingOption === 'view_once'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        setDecryptedTexts(prev => ({ ...prev, [data.message.id]: fileUrl }));
      }
    } catch (err) {}
  };

  // 9. Camera Capture
  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert('Camera access denied or unavailable.');
      setShowCamera(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.85);

    const stream = videoRef.current.srcObject as MediaStream;
    if (stream) stream.getTracks().forEach(t => t.stop());
    setShowCamera(false);

    sendMediaMessage(base64, 'image');
  };

  // 10. Voice Recording
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await sendMediaMessage(base64Audio, 'audio');
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecordingVoice(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied or unavailable.');
    }
  };

  const stopVoiceRecording = (send: boolean) => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingVoice(false);
    setRecordingTime(0);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (!send) {
        audioChunksRef.current = [];
        mediaRecorderRef.current.onstop = null;
      }
      mediaRecorderRef.current.stop();
    }
  };

  // 11. View Once Reveal
  const handleViewOnceOpen = async (msgId: string) => {
    try {
      await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'viewOnceOpened', messageId: msgId, userId: currentUser?.id })
      });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, viewOnceOpened: true } : m));
    } catch (err) {}
  };

  // 12. Message Deletion Handlers
  const handleDeleteMessage = async (msgId: string, actionType: 'deleteForMe' | 'deleteForEveryone') => {
    if (!currentUser) return;
    setSelectedMessageMenuId(null);

    try {
      const res = await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, messageId: msgId, userId: currentUser.id })
      });

      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== msgId));
      }
    } catch (err) {}
  };

  // 13. Add Contact Handler
  const handleSearchContact = async (query: string) => {
    setContactSearchInput(query);
    setAddContactMessage('');

    if (!query.trim() || !currentUser) {
      setContactSearchResults([]);
      return;
    }

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', userId: currentUser.id, contactUsername: query })
      });
      const data = await res.json();
      if (res.ok) {
        setContactSearchResults(data.users || []);
      }
    } catch (err) {}
  };

  const handleAddContact = async (targetUsername: string) => {
    if (!currentUser) return;
    setAddContactMessage('');

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', userId: currentUser.id, contactUsername: targetUsername })
      });

      const data = await res.json();
      if (res.ok) {
        setAddContactMessage(data.message);
        setContacts(prev => {
          if (prev.some(c => c.id === data.contact.id)) return prev;
          return [...prev, data.contact];
        });
        selectContactWithHistory(data.contact);
        setShowAddContactModal(false);
        setContactSearchInput('');
      } else {
        setAddContactMessage(data.error || 'Failed to add contact');
      }
    } catch (err) {
      setAddContactMessage('Failed to add contact');
    }
  };

  // 14. Save Profile Settings
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setProfileSaveMessage('');

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          fullName: editFullName,
          statusMessage: editStatusMessage
        })
      });

      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data.user);
        localStorage.setItem('szchat_user_session', JSON.stringify(data.user));
        setProfileSaveMessage('Profile saved successfully!');
        setTimeout(() => setShowSettingsDrawer(false), 1200);
      } else {
        setProfileSaveMessage(data.error || 'Failed to save profile');
      }
    } catch (err) {
      setProfileSaveMessage('Failed to save profile');
    }
  };

  const filteredContacts = contacts.filter(c => 
    c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getRemainingTimeBadge = (expiresAt?: number) => {
    if (!expiresAt) return null;
    const diffSec = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    if (diffSec <= 0) return 'Expired';
    if (diffSec < 3600) return `${Math.ceil(diffSec / 60)}m left`;
    if (diffSec < 86400) return `${Math.ceil(diffSec / 3600)}h left`;
    return `${Math.ceil(diffSec / 86400)}d left`;
  };

  if (!isMounted) {
    return (
      <div className="auth-overlay" suppressHydrationWarning>
        <div className="auth-card" suppressHydrationWarning>
          <div className="auth-header">
            <h1 className="auth-title">szchat</h1>
            <p className="auth-subtitle">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="auth-overlay" suppressHydrationWarning>
        <div className="auth-card" suppressHydrationWarning>
          <div className="auth-header">
            <img src="/icon.svg" alt="szchat logo" style={{ width: '54px', height: '54px', marginBottom: '8px' }} />
            <h1 className="auth-title">szchat</h1>
            <p className="auth-subtitle">Encrypted WhatsApp-Style Web Messaging</p>
          </div>

          <div className="auth-tabs" suppressHydrationWarning>
            <button 
              className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              suppressHydrationWarning
            >
              Login
            </button>
            <button 
              className={`auth-tab ${authMode === 'signup' ? 'active' : ''}`}
              onClick={() => { setAuthMode('signup'); setAuthError(''); }}
              suppressHydrationWarning
            >
              Sign Up
            </button>
          </div>

          {authError && <div className="error-banner">{authError}</div>}

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} suppressHydrationWarning>
            <div className="form-group" suppressHydrationWarning>
              <label className="form-label">Username</label>
              <input 
                type="text" 
                required 
                className="form-input" 
                placeholder="Enter username" 
                value={authUsername} 
                onChange={e => setAuthUsername(e.target.value)}
                suppressHydrationWarning
              />
            </div>

            {authMode === 'signup' && (
              <div className="form-group" suppressHydrationWarning>
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  required 
                  className="form-input" 
                  placeholder="Enter full name" 
                  value={authFullName} 
                  onChange={e => setAuthFullName(e.target.value)}
                  suppressHydrationWarning
                />
              </div>
            )}

            <div className="form-group" suppressHydrationWarning>
              <label className="form-label">Password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type={showAuthPassword ? "text" : "password"} 
                  required 
                  className="form-input" 
                  style={{ width: '100%', paddingRight: '42px' }}
                  placeholder="Enter password" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)}
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={() => setShowAuthPassword(!showAuthPassword)}
                  style={{
                    position: 'absolute', right: '10px', background: 'transparent',
                    border: 'none', color: 'var(--wa-text-secondary)', cursor: 'pointer', fontSize: '16px'
                  }}
                  title={showAuthPassword ? "Hide password" : "Show password"}
                >
                  {showAuthPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={authLoading} style={{ marginTop: '8px' }} suppressHydrationWarning>
              {authLoading ? 'Processing...' : (authMode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <Link href="/admin" style={{ color: 'var(--wa-text-secondary)', fontSize: '12px', textDecoration: 'underline' }}>
              Admin Portal Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* SIDEBAR: Private Contacts */}
      <aside className={`sidebar ${showMobileChat ? 'hidden-mobile' : ''}`}>
        <div className="sidebar-header">
          <div className="user-profile-badge">
            <div className="avatar" style={{ backgroundColor: currentUser.avatarColor }}>
              {currentUser.fullName.charAt(0)}
            </div>
            <div className="profile-info">
              <span className="profile-name">{currentUser.fullName}</span>
              <span className="profile-username">@{currentUser.username}</span>
              <span className={`db-status-badge ${dbProvider.includes('MongoDB') ? 'mongo' : 'local'}`}>
                {dbProvider.includes('MongoDB') ? '🟢 MongoDB Atlas' : '🟡 JSON DB'}
              </span>
            </div>
          </div>

          <div className="sidebar-actions">
            <button 
              className="icon-btn" 
              onClick={() => setShowAddContactModal(true)} 
              title="Add Contact by Username"
              style={{ color: 'var(--wa-primary)' }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9 0c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm9 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45v2h6v-2c0-2.66-5.33-4-7-4z"/>
              </svg>
            </button>

            <button 
              className="icon-btn" 
              onClick={() => {
                setEditFullName(currentUser.fullName);
                setEditStatusMessage(currentUser.statusMessage || 'Hey there! I am using szchat.');
                setShowSettingsDrawer(true);
              }} 
              title="Settings"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </button>

            <Link href="/admin" className="icon-btn" title="Admin Portal">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8s0 0 0 0z"/>
              </svg>
            </Link>

            <button className="icon-btn" onClick={handleLogout} title="Logout">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <div className="search-input-wrapper">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--wa-text-muted)" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search contacts..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Contacts */}
        <div className="contacts-list">
          {contactsLoading ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--wa-text-muted)', fontSize: '13px' }}>
              <div style={{ display: 'inline-block', width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--wa-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '8px' }}></div>
              <p>Loading chats...</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--wa-text-muted)', fontSize: '13px' }}>
              <p style={{ marginBottom: '12px' }}>Your contact list is clean & private!</p>
              <button 
                className="btn-primary" 
                style={{ padding: '8px 14px', fontSize: '12px' }}
                onClick={() => setShowAddContactModal(true)}
              >
                ➕ Add Contact by @Username
              </button>
            </div>
          ) : (
            filteredContacts.map(contact => {
              const isSelected = activeContact?.id === contact.id;
              return (
                <div 
                  key={contact.id} 
                  className={`contact-item ${isSelected ? 'active' : ''}`}
                  onClick={() => selectContactWithHistory(contact)}
                >
                  <div className="avatar-wrapper">
                    <div className="avatar" style={{ backgroundColor: contact.avatarColor }}>
                      {contact.fullName.charAt(0)}
                    </div>
                    {contact.isOnline && <div className="online-dot" />}
                  </div>

                  <div className="contact-details">
                    <div className="contact-top-row">
                      <span className="contact-name">{contact.fullName}</span>
                      {contact.lastMessage && (
                        <span className="contact-time">{formatTime(contact.lastMessage.timestamp)}</span>
                      )}
                    </div>

                    <div className="contact-bottom-row">
                      <span className={`contact-preview ${isSelected && isPeerTyping ? 'typing-text' : ''}`}>
                        {isSelected && isPeerTyping ? 'typing...' : (
                          contact.lastMessage ? (
                            contact.lastMessage.fileType === 'image' ? '📷 Photo' :
                            contact.lastMessage.fileType === 'audio' ? '🎤 Voice Note' :
                            (decryptedTexts[contact.lastMessage.id] || contact.lastMessage.text || '🔒 Encrypted Message')
                          ) : `@${contact.username}`
                        )}
                      </span>
                      {contact.unreadCount ? (
                        <div className="unread-badge">{contact.unreadCount}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <div className="auth-overlay">
          <div className="auth-card" style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>➕ Add Contact by Username</h2>
              <button className="icon-btn" onClick={() => setShowAddContactModal(false)}>❌</button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--wa-text-secondary)' }}>
              Enter the exact username of the person you want to add to your private chat list.
            </p>

            {addContactMessage && <div className="error-banner">{addContactMessage}</div>}

            <div className="form-group">
              <input 
                type="text" 
                className="form-input" 
                placeholder="Type @username (e.g. john)" 
                value={contactSearchInput} 
                onChange={e => handleSearchContact(e.target.value)}
              />
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {contactSearchResults.map(user => (
                <div key={user.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', background: 'var(--wa-header-dark)', borderRadius: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="avatar sm" style={{ backgroundColor: user.avatarColor }}>
                      {user.fullName.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600' }}>{user.fullName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--wa-text-secondary)' }}>@{user.username}</div>
                    </div>
                  </div>
                  <button 
                    className="btn-primary" 
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => handleAddContact(user.username)}
                  >
                    Add Contact
                  </button>
                </div>
              ))}
            </div>

            <button 
              className="btn-primary" 
              style={{ background: 'var(--wa-header-dark)', color: '#fff' }}
              onClick={() => handleAddContact(contactSearchInput)}
            >
              Add @{contactSearchInput || 'username'}
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp Settings Drawer */}
      {showSettingsDrawer && (
        <div className="auth-overlay">
          <div className="auth-card" style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>⚙️ Settings</h2>
              <button className="icon-btn" onClick={() => setShowSettingsDrawer(false)}>❌</button>
            </div>

            {profileSaveMessage && (
              <div className="error-banner" style={{ background: 'rgba(0, 168, 132, 0.15)', borderColor: 'var(--wa-primary)', color: 'var(--wa-primary)' }}>
                {profileSaveMessage}
              </div>
            )}

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Your Full Name</label>
                <input 
                  type="text" 
                  required
                  className="form-input" 
                  value={editFullName} 
                  onChange={e => setEditFullName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Status Message (About)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editStatusMessage} 
                  onChange={e => setEditStatusMessage(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>
                SAVE CHANGES
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MAIN CHAT AREA */}
      <main className={`main-chat ${showMobileChat && activeContact ? 'active-mobile' : ''}`}>
        {activeContact ? (
          <>
            {/* Header */}
            <div className="chat-header">
              <div className="chat-header-info">
                <button 
                  className="icon-btn back-btn-mobile" 
                  onClick={closeMobileChatWithHistory}
                  title="Back to contacts"
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>

                <div className="avatar-wrapper">
                  <div className="avatar sm" style={{ backgroundColor: activeContact.avatarColor }}>
                    {activeContact.fullName.charAt(0)}
                  </div>
                  {activeContact.isOnline && <div className="online-dot" />}
                </div>

                <div className="chat-user-title">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="chat-username">{activeContact.fullName}</span>
                    <span style={{ fontSize: '11px', color: 'var(--wa-primary)', fontWeight: '600' }}>🔒 E2EE</span>
                  </div>
                  <span className={`chat-status ${isPeerTyping ? 'typing' : ''}`}>
                    {isPeerTyping ? 'typing...' : (activeContact.isOnline ? 'online' : 'offline')}
                  </span>
                </div>
              </div>

              {/* Disappearing Messages Trigger */}
              <div style={{ position: 'relative' }}>
                <button 
                  className={`disappearing-timer-btn ${disappearingOption !== 'off' ? 'active' : ''}`}
                  onClick={() => setShowDisappearingMenu(!showDisappearingMenu)}
                  title="Configure Disappearing Messages"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span>⏱️ {DISAPPEARING_LABELS[disappearingOption]}</span>
                </button>

                {showDisappearingMenu && (
                  <div className="disappearing-menu-popover">
                    <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '700', color: 'var(--wa-text-muted)', textTransform: 'uppercase' }}>
                      Disappearing Messages
                    </div>
                    {(['off', 'view_once', '1h', '24h', '7d'] as DisappearingOption[]).map(option => (
                      <div 
                        key={option}
                        className={`disappearing-option-item ${disappearingOption === option ? 'selected' : ''}`}
                        onClick={() => {
                          setDisappearingOption(option);
                          setShowDisappearingMenu(false);
                        }}
                      >
                        <span>{DISAPPEARING_LABELS[option]}</span>
                        {disappearingOption === option && <span>✓</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Camera Overlay */}
            {showCamera && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 200, background: '#000',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <video ref={videoRef} autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px' }} />
                <div style={{ display: 'flex', gap: '16px', marginTop: '20px' }}>
                  <button className="btn-primary" onClick={capturePhoto}>📸 Take Photo</button>
                  <button className="btn-primary" style={{ background: 'var(--wa-header-dark)', color: '#fff' }} onClick={() => {
                    if (videoRef.current && videoRef.current.srcObject) {
                      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
                    }
                    setShowCamera(false);
                  }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Messages Feed Container with Internal Scroll Locking */}
            <div className="chat-messages-container" ref={messagesContainerRef} onClick={() => setSelectedMessageMenuId(null)}>
              <div style={{ textAlign: 'center', padding: '8px 12px', fontSize: '11px', color: '#8696a0', background: '#182229', borderRadius: '8px', marginBottom: '12px', maxWidth: '380px', margin: '0 auto 12px auto' }}>
                🔒 Messages are end-to-end encrypted. No one outside of this chat can read or listen to them.
              </div>

              {messages.map(msg => {
                const isMine = msg.senderId === currentUser.id;
                const remainingBadge = getRemainingTimeBadge(msg.expiresAt);
                const decryptedContent = decryptedTexts[msg.id] || msg.text || '';
                const isMenuOpen = selectedMessageMenuId === msg.id;

                return (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={`message-bubble ${isMine ? 'mine' : 'theirs'} ${msg.isOptimistic ? 'optimistic' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMessageMenuId(isMenuOpen ? null : msg.id);
                    }}
                  >
                    {/* Message Context Action Menu */}
                    {isMenuOpen && (
                      <div style={{
                        position: 'absolute', top: '-44px',
                        right: isMine ? '0' : 'auto', left: isMine ? 'auto' : '0',
                        background: 'var(--wa-header-dark)', border: '1px solid var(--wa-border-dark)',
                        borderRadius: '10px', padding: '4px',
                        display: 'flex', gap: '2px', zIndex: 100, boxShadow: 'var(--shadow-md)',
                        whiteSpace: 'nowrap',
                      }}>
                        <button
                          style={{ background: 'transparent', border: 'none', color: 'var(--wa-primary)', fontSize: '12px', padding: '5px 8px', cursor: 'pointer', borderRadius: '6px' }}
                          onClick={(e) => { e.stopPropagation(); handleReply(msg, isMine ? currentUser.fullName : activeContact.fullName); }}
                        >
                          ↩️ Reply
                        </button>
                        <button
                          style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '12px', padding: '5px 8px', cursor: 'pointer', borderRadius: '6px' }}
                          onClick={(e) => { e.stopPropagation(); if (decryptedContent) navigator.clipboard.writeText(decryptedContent); setSelectedMessageMenuId(null); }}
                        >
                          📋 Copy
                        </button>
                        <button
                          style={{ background: 'transparent', border: 'none', color: 'var(--wa-danger)', fontSize: '12px', padding: '5px 8px', cursor: 'pointer', borderRadius: '6px' }}
                          onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id, 'deleteForMe'); }}
                        >
                          🗑️ Delete
                        </button>
                        {isMine && (
                          <button
                            style={{ background: 'transparent', border: 'none', color: 'var(--wa-danger)', fontSize: '12px', padding: '5px 8px', cursor: 'pointer', borderRadius: '6px' }}
                            onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id, 'deleteForEveryone'); }}
                          >
                            🚨 Everyone
                          </button>
                        )}
                      </div>
                    )}

                    {/* ── Reply Quote Preview ── */}
                    {msg.replyToId && msg.replyToText && (
                      <div style={{
                        borderLeft: '3px solid var(--wa-primary)',
                        background: isMine ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.07)',
                        borderRadius: '6px',
                        padding: '5px 8px',
                        marginBottom: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        maxWidth: '100%',
                        overflow: 'hidden',
                      }}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Scroll to original message
                          const el = document.getElementById(`msg-${msg.replyToId}`);
                          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('highlight-flash'); setTimeout(() => el.classList.remove('highlight-flash'), 1000); }
                        }}
                      >
                        <div style={{ color: 'var(--wa-primary)', fontWeight: 600, marginBottom: '2px', fontSize: '11px' }}>
                          {msg.replyToSender || 'Message'}
                        </div>
                        <div style={{ color: 'var(--wa-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                          {msg.replyToText}
                        </div>
                      </div>
                    )}

                    {/* View Once Logic */}
                    {msg.viewOnce ? (
                      msg.viewOnceOpened ? (
                        <div className="view-once-opened">⏱️ View-once photo opened</div>
                      ) : (
                        !isMine ? (
                          <button className="view-once-btn" onClick={() => handleViewOnceOpen(msg.id)}>
                            ⏱️ View Once Photo (Click to reveal)
                          </button>
                        ) : (
                          <div className="view-once-opened">⏱️ View-once photo sent</div>
                        )
                      )
                    ) : null}

                    {/* Image */}
                    {msg.fileType === 'image' && decryptedContent && (!msg.viewOnce || (msg.viewOnce && msg.viewOnceOpened)) && (
                      <img src={decryptedContent} alt="Attachment" className="media-image" />
                    )}

                    {/* Voice Note */}
                    {msg.fileType === 'audio' && decryptedContent && (
                      <div className="audio-player-container">
                        <audio controls src={decryptedContent} />
                      </div>
                    )}

                    {/* Text */}
                    {!msg.fileType && <p style={{ margin: 0 }}>{decryptedContent}</p>}

                    {/* Metadata & WhatsApp Ticks */}
                    <div className="message-meta">
                      {remainingBadge && (
                        <span className="timer-badge">⏱️ {remainingBadge}</span>
                      )}
                      <span>{formatTime(msg.timestamp)}</span>
                      {isMine && (
                        <span className={`tick-mark ${msg.status === 'read' ? 'blue' : 'gray'} ${msg.isOptimistic ? 'optimistic-tick' : ''}`}>
                          {msg.status === 'sent' ? (
                            <svg viewBox="0 0 16 16"><path d="M15.01 3.3L6.41 11.9 1.4 6.89l1.41-1.41 3.6 3.6 7.19-7.19z"/></svg>
                          ) : (
                            <svg viewBox="0 0 16 16"><path d="M15.01 3.3L6.41 11.9 1.4 6.89l1.41-1.41 3.6 3.6 7.19-7.19zm-3.6 0L4.22 10.49l-1.41-1.41 7.19-7.19z"/></svg>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div className="popover-menu">
                <div className="emoji-grid">
                  {POPULAR_EMOJIS.map(emoji => (
                    <span 
                      key={emoji} 
                      className="emoji-item"
                      onClick={() => {
                        setInputText(prev => prev + emoji);
                        setShowEmojiPicker(false);
                      }}
                    >
                      {emoji}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Input Bar - Always Pinned & Visible */}
            <div className="chat-input-bar">
              {isRecordingVoice ? (
                <div className="recording-bar">
                  <div className="recording-dot" />
                  <span>Recording Audio... ({recordingTime}s)</span>
                  <button className="icon-btn" style={{ marginLeft: 'auto', color: 'var(--wa-danger)' }} onClick={() => stopVoiceRecording(false)} title="Cancel">
                    ❌
                  </button>
                  <button className="icon-btn" style={{ color: 'var(--wa-primary)' }} onClick={() => stopVoiceRecording(true)} title="Send Voice Note">
                    ✓
                  </button>
                </div>
              ) : (
                <>
                  <button 
                    type="button" 
                    className={`icon-btn ${showEmojiPicker ? 'active-icon' : ''}`}
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    title="Emoji"
                  >
                    😊
                  </button>

                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    onChange={handleFileUpload} 
                  />
                  <button 
                    type="button" 
                    className="icon-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach Image"
                  >
                    📎
                  </button>

                  <button 
                    type="button" 
                    className="icon-btn"
                    onClick={startCamera}
                    title="Camera"
                  >
                    📸
                  </button>

                  {/* Reply bar above input — shows when replying */}
                  {replyTo && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 12px',
                      background: 'var(--wa-input-dark)',
                      borderTop: '1px solid var(--wa-border-dark)',
                      borderRadius: '8px 8px 0 0',
                      marginBottom: '-1px',
                    }}>
                      <div style={{ borderLeft: '3px solid var(--wa-primary)', paddingLeft: '8px', flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--wa-primary)' }}>{replyTo.senderName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--wa-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.text}</div>
                      </div>
                      <button
                        onClick={() => setReplyTo(null)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--wa-text-muted)', fontSize: '18px', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <input
                    type="text"
                    ref={inputRef}
                    className="input-box"
                    placeholder="Encrypted message..."
                    value={inputText}
                    onChange={e => handleInputChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSendMessage();
                    }}
                  />

                  <button 
                    type="button" 
                    className="send-btn" 
                    onClick={handleSendMessage} 
                    disabled={!inputText.trim()}
                    title="Send Message"
                    style={{ opacity: inputText.trim() ? 1 : 0.6 }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                  </button>

                  <button 
                    type="button" 
                    className="icon-btn" 
                    onClick={startVoiceRecording} 
                    title="Record Voice Note"
                  >
                    🎤
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="empty-chat-state">
            <img src="/icon.svg" alt="szchat logo" style={{ width: '80px', height: '80px', marginBottom: '16px' }} />
            <h2>szchat</h2>
            <p style={{ marginTop: '8px', maxWidth: '360px', fontSize: '14px', lineHeight: '1.5' }}>
              Add a contact by @username to start a private, end-to-end encrypted (AES-GCM 256-bit) chat session.
            </p>
            <button 
              className="btn-primary" 
              style={{ marginTop: '16px', padding: '10px 20px' }}
              onClick={() => setShowAddContactModal(true)}
            >
              ➕ Add Contact by Username
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
