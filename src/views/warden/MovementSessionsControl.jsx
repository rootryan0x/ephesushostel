import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { DynamicQRDisplay } from '../../components/DynamicQRDisplay';
import {
  QrCode, Play, Pause, Square, GraduationCap, Compass,
  MapPin, CheckCircle2, Clock, AlertCircle, RefreshCw
} from 'lucide-react';

export function MovementSessionsControl() {
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startingType, setStartingType] = useState(null);
  const [tokenInterval, setTokenInterval] = useState(3);
  const [errorMsg, setErrorMsg] = useState(null);

  const fetchActiveSession = async () => {
    try {
      const data = await api.getActiveSession();
      setActiveSession(data.session);
    } catch (err) {
      console.error('Failed to get active session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveSession();
  }, []);

  const handleStartSession = async (movementType, title) => {
    setStartingType(movementType);
    setErrorMsg(null);

    try {
      await api.startSession(movementType, title, tokenInterval);
      await fetchActiveSession();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setStartingType(null);
    }
  };

  const sessionTemplates = [
    {
      type: 'COLLEGE_OUT',
      title: 'Morning College OUT Session',
      desc: 'Students leave Ephesus Hostel to attend Providence College classes.',
      icon: GraduationCap,
      color: '#d97706'
    },
    {
      type: 'COLLEGE_IN',
      title: 'Evening College IN Session',
      desc: 'Students return from classes and campus labs back to Ephesus Hostel.',
      icon: GraduationCap,
      color: '#059669'
    },
    {
      type: 'OUTPASS_OUT',
      title: 'Outpass Departure OUT Session',
      desc: 'Permits students with approved outpasses to depart for town/errands.',
      icon: Compass,
      color: '#0284c7'
    },
    {
      type: 'OUTPASS_IN',
      title: 'Outpass Return IN Session',
      desc: 'Verifies students returning to hostel from town outpasses.',
      icon: Compass,
      color: '#10b981'
    },
    {
      type: 'LEAVE_OUT',
      title: 'Weekend / Home Leave OUT Session',
      desc: 'Permits students with approved leaves to depart home (from hostel or after Friday classes).',
      icon: MapPin,
      color: '#7c3aed'
    },
    {
      type: 'LEAVE_IN',
      title: 'Weekend / Home Leave Return IN Session',
      desc: 'Verifies students returning from home leave back into the hostel.',
      icon: MapPin,
      color: '#047857'
    }
  ];

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Dynamic QR Movement Sessions
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Hardware-free movement tracking: Warden displays rotating QR, students scan using their phones
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            QR Rotation Period:
          </span>
          <select
            className="form-control"
            style={{ width: 'auto', padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
            value={tokenInterval}
            onChange={e => setTokenInterval(parseInt(e.target.value))}
            disabled={!!activeSession}
          >
            <option value={3}>3 seconds (Ultra-Secure Anti-Proxy • Default)</option>
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={15}>15 seconds</option>
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      {/* Active Dynamic QR Display Mode */}
      {activeSession ? (
        <div style={{ marginBottom: '2rem' }}>
          <DynamicQRDisplay
            session={activeSession}
            onSessionUpdated={fetchActiveSession}
          />
        </div>
      ) : (
        <div style={{
          background: '#ffffff',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-light)',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem'
          }}>
            Select Movement Session to Launch
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1rem'
          }}>
            {sessionTemplates.map((tmpl) => {
              const Icon = tmpl.icon;
              const isStarting = startingType === tmpl.type;

              return (
                <div
                  key={tmpl.type}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 'var(--radius-md)',
                      background: `${tmpl.color}15`, color: tmpl.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Icon size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {tmpl.title}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                        {tmpl.desc}
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => handleStartSession(tmpl.type, tmpl.title)}
                    disabled={isStarting}
                    style={{ width: '100%', fontWeight: 700 }}
                  >
                    {isStarting ? (
                      <>
                        <RefreshCw size={15} className="spin" /> Launching Session...
                      </>
                    ) : (
                      <>
                        <Play size={15} /> Start {tmpl.title.split(' ')[1]} {tmpl.title.split(' ')[2]}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
