import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { QrCode, Pause, Play, Square, Users, CheckCircle2, AlertCircle, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';

export function DynamicQRDisplay({ session, onSessionUpdated }) {
  const [qrData, setQrData] = useState(null);
  const [liveStats, setLiveStats] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(session?.token_interval_seconds || 3);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('scanned'); // 'scanned' | 'pending' | 'leave'

  const fetchToken = async () => {
    try {
      const data = await api.getSessionToken(session.id);
      setQrData(data);
      setSecondsRemaining(data.intervalSeconds || 3);
    } catch (err) {
      console.error('Failed to refresh dynamic QR token:', err);
    }
  };

  const fetchLiveStats = async () => {
    try {
      const stats = await api.getSessionLiveStats(session.id);
      setLiveStats(stats);
    } catch (err) {
      console.error('Failed to fetch live session stats:', err);
    }
  };

  // Initial load
  useEffect(() => {
    if (!session || session.status === 'COMPLETED') return;
    fetchToken();
    fetchLiveStats();

    // Poll live stats every 3 seconds for real-time warden attendance feed
    const statsInterval = setInterval(fetchLiveStats, 3000);
    return () => clearInterval(statsInterval);
  }, [session?.id, session?.status]);

  // Countdown timer for rotating dynamic QR
  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;

    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          fetchToken();
          return session?.token_interval_seconds || 3;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [session?.id, session?.status, session?.token_interval_seconds]);

  const handlePause = async () => {
    setLoading(true);
    try {
      await api.pauseSession();
      onSessionUpdated();
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    setLoading(true);
    try {
      await api.resumeSession();
      onSessionUpdated();
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    if (!window.confirm('Are you sure you want to end this movement session? Students will no longer be able to scan.')) {
      return;
    }
    setLoading(true);
    try {
      await api.endSession();
      onSessionUpdated();
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  const total = liveStats?.totalStudents || 75;
  const completed = liveStats?.completedCount || 0;
  const pending = liveStats?.pendingCount || (total - completed);
  const onLeave = liveStats?.onLeaveCount || 0;
  const completedPct = Math.round((completed / total) * 100);

  const containerStyle = isFullScreen ? {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    borderRadius: 0,
    overflowY: 'auto',
    padding: '2rem'
  } : {};

  return (
    <div className="warden-qr-screen" style={containerStyle}>
      {/* Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{
            fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em',
            color: '#94a3b8', fontWeight: 700
          }}>
            EPHEUS HOSTEL • DYNAMIC QR MOVEMENT SESSION
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0 0', color: '#ffffff' }}>
            {session.title || session.label}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {session.status === 'ACTIVE' ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handlePause}
              disabled={loading}
              style={{ background: 'rgba(255,255,255,0.15)', color: 'white', borderColor: 'transparent' }}
            >
              <Pause size={15} /> Pause
            </button>
          ) : (
            <button
              className="btn btn-success btn-sm"
              onClick={handleResume}
              disabled={loading}
            >
              <Play size={15} /> Resume
            </button>
          )}

          <button
            className="btn btn-danger btn-sm"
            onClick={handleEnd}
            disabled={loading}
          >
            <Square size={15} /> End Session
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsFullScreen(!isFullScreen)}
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', borderColor: 'transparent' }}
            title={isFullScreen ? 'Exit Projector Mode' : 'Enter Large Screen / Projector Mode'}
          >
            {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Main Content Layout: QR Box on Left, Live Stats Stream on Right */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isFullScreen ? '1fr 1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '2rem',
        width: '100%',
        alignItems: 'center',
        margin: '1rem 0'
      }}>
        {/* Dynamic QR Display Column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="qr-box-wrapper">
            {qrData?.qrDataUrl ? (
              <img
                src={qrData.qrDataUrl}
                alt="Dynamic Session QR Code"
                style={{
                  width: isFullScreen ? 340 : 260,
                  height: isFullScreen ? 340 : 260,
                  display: 'block'
                }}
              />
            ) : (
              <div style={{
                width: 260, height: 260,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#64748b'
              }}>
                <RefreshCw size={36} className="spin" />
              </div>
            )}
          </div>

          {/* Rotating Progress Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              Rotates in {secondsRemaining}s
            </span>
          </div>
          <div className="qr-progress-bar-container">
            <div
              className="qr-progress-bar-fill"
              style={{ width: `${(secondsRemaining / (qrData?.intervalSeconds || session?.token_interval_seconds || 3)) * 100}%` }}
            />
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#a7f3d0',
            padding: '0.35rem 0.65rem',
            borderRadius: 9999,
            fontSize: '0.72rem',
            fontWeight: 700,
            marginTop: '0.625rem'
          }}>
            <span>🛡️ Anti-Proxy Guard Active</span>
            <span style={{ opacity: 0.6 }}>•</span>
            <span>3s Rolling Code</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.35rem', maxWidth: 320, textAlign: 'center' }}>
            Token rotates every {qrData?.intervalSeconds || session?.token_interval_seconds || 3}s. Forwarded photos expire instantly. Hardware locked: 1 device = 1 student.
          </p>
        </div>

        {/* Live Attendance Stream Column */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '1.25rem',
          textAlign: 'left'
        }}>
          {/* Counters Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
            marginBottom: '1.25rem'
          }}>
            <div style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#6ee7b7', fontWeight: 700, textTransform: 'uppercase' }}>
                Completed
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', marginTop: '0.25rem' }}>
                {completed} <span style={{ fontSize: '0.875rem', color: '#94a3b8', fontWeight: 500 }}>/ {total}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#a7f3d0', marginTop: '0.25rem' }}>
                {completedPct}% of hostel
              </div>
            </div>

            <div style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#fde68a', fontWeight: 700, textTransform: 'uppercase' }}>
                Pending Scans
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', marginTop: '0.25rem' }}>
                {pending}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#fcd34d', marginTop: '0.25rem' }}>
                Awaiting scan
              </div>
            </div>

            <div style={{
              background: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#c4b5fd', fontWeight: 700, textTransform: 'uppercase' }}>
                Approved Leave
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', marginTop: '0.25rem' }}>
                {onLeave}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#ddd6fe', marginTop: '0.25rem' }}>
                Excused
              </div>
            </div>
          </div>

          {/* Real-time Blocked Proxy Attempts Alert Banner */}
          {liveStats?.blockedProxyCount > 0 && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '0.625rem 0.875rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#fca5a5',
              fontSize: '0.8rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.1rem' }}>🚨</span>
                <span style={{ fontWeight: 700 }}>
                  {liveStats.blockedProxyCount} Proxy Scan Attempt{liveStats.blockedProxyCount > 1 ? 's' : ''} Blocked & Logged
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#fecaca', background: 'rgba(0,0,0,0.3)', padding: '0.15rem 0.5rem', borderRadius: 9999 }}>
                Audit Logged
              </span>
            </div>
          )}

          {/* Subtabs: Scanned vs Pending vs On Leave */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              onClick={() => setActiveTab('scanned')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeTab === 'scanned' ? '#38bdf8' : '#94a3b8',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                borderBottom: activeTab === 'scanned' ? '2px solid #38bdf8' : 'none',
                paddingBottom: '0.25rem'
              }}
            >
              Scanned ({liveStats?.completed?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeTab === 'pending' ? '#38bdf8' : '#94a3b8',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                borderBottom: activeTab === 'pending' ? '2px solid #38bdf8' : 'none',
                paddingBottom: '0.25rem'
              }}
            >
              Pending ({liveStats?.pending?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('leave')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeTab === 'leave' ? '#38bdf8' : '#94a3b8',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                borderBottom: activeTab === 'leave' ? '2px solid #38bdf8' : 'none',
                paddingBottom: '0.25rem'
              }}
            >
              On Leave ({liveStats?.onLeave?.length || 0})
            </button>
          </div>

          {/* Stream List */}
          <div style={{ maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {activeTab === 'scanned' && (
              liveStats?.completed?.length > 0 ? (
                liveStats.completed.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.06)', padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)', fontSize: '0.8rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 size={15} color="#10b981" />
                      <span style={{ fontWeight: 600, color: '#ffffff' }}>{r.full_name}</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>• Room {r.room_number}</span>
                    </div>
                    <span style={{ color: '#6ee7b7', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      {new Date(r.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0', fontSize: '0.85rem' }}>
                  Waiting for first student scan...
                </div>
              )
            )}

            {activeTab === 'pending' && (
              liveStats?.pending?.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.03)', padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)', fontSize: '0.8rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>⏳</span>
                    <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{s.full_name}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>• {s.room_number}</span>
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{s.year}</span>
                </div>
              ))
            )}

            {activeTab === 'leave' && (
              liveStats?.onLeave?.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(139,92,246,0.1)', padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)', fontSize: '0.8rem'
                }}>
                  <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{s.full_name}</span>
                  <span style={{ color: '#c4b5fd', fontSize: '0.72rem' }}>Room {s.room_number} • On Leave</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
