import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Camera, CheckCircle2, AlertCircle, X, RefreshCw, Zap } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export function QRScannerModal({ isOpen, onClose, targetMovementType, onSuccess }) {
  const { student, refreshProfile } = useAuth();
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [manualToken, setManualToken] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const scannerRef = useRef(null);

  // Check active movement session on mount
  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(() => {});
          }
        } catch (e) {}
        scannerRef.current = null;
      }
      setCameraActive(false);
      setScanResult(null);
      setErrorMsg(null);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setScanResult(null);

    api.getActiveSession()
      .then(res => {
        setActiveSession(res.session);
        setLoading(false);
        if (res.session) {
          setTimeout(() => {
            startCamera();
          }, 300);
        }
      })
      .catch(err => {
        setErrorMsg('Failed to check active movement session: ' + err.message);
        setLoading(false);
      });
  }, [isOpen]);

  // Start camera scanner
  const startCamera = async () => {
    setErrorMsg(null);
    setCameraActive(true);

    try {
      const html5QrCode = new Html5Qrcode('qr-reader-viewport');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        async (decodedText) => {
          // Scanned successfully! Stop scanner and submit
          try {
            await html5QrCode.stop();
            setCameraActive(false);
          } catch (e) {}
          processScanToken(decodedText);
        },
        (errorMessage) => {
          // ignore frame errors
        }
      );
    } catch (err) {
      console.warn('Camera could not be started:', err);
      setCameraActive(false);
      setErrorMsg('Camera access unavailable or blocked. Please grant camera permission in your browser to scan the QR code.');
    }
  };

  const processScanToken = async (token) => {
    setScanning(true);
    setErrorMsg(null);

    try {
      const result = await api.scanQR(token);
      setScanResult(result);
      // Trigger celebratory micro-animation
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 }
      });
      await refreshProfile();
      if (onSuccess) onSuccess(result);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setScanning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--primary-subtle)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Camera size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                {activeSession ? activeSession.title : 'QR Movement Scanner'}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Ephesus Hostel • Providence College
              </p>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.25rem 0.5rem' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ textAlign: 'center' }}>
          {loading ? (
            <div style={{ padding: '3rem 0', color: 'var(--text-muted)' }}>
              <RefreshCw size={32} className="spin" />
              <p style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>Checking active movement session...</p>
            </div>
          ) : scanResult ? (
            /* Verified Scan Success Receipt */
            <div style={{
              background: 'linear-gradient(145deg, #ecfdf5 0%, #d1fae5 100%)',
              border: '2px solid #10b981',
              borderRadius: 'var(--radius-xl)',
              padding: '1.75rem 1.25rem',
              color: '#065f46'
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: '#10b981', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
              }}>
                <CheckCircle2 size={32} />
              </div>

              <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#047857' }}>
                ✓ Movement Verified
              </div>

              <div style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.375rem 0', color: '#065f46' }}>
                {scanResult.label}
              </div>

              <div style={{
                fontSize: '0.85rem', color: '#047857', fontFamily: 'var(--font-mono)',
                background: 'rgba(255,255,255,0.7)', display: 'inline-block',
                padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)', margin: '0.5rem 0'
              }}>
                Recorded at {scanResult.timestamp}
              </div>

              <div style={{
                marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem'
              }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#047857', fontWeight: 700 }}>
                  Your Current Live Status:
                </span>
                <StatusBadge status={scanResult.newStatus} />
              </div>
            </div>
          ) : (
            /* Active Scan Flow */
            <div>
              {!activeSession ? (
                <div style={{ padding: '2rem 1rem' }}>
                  <AlertCircle size={40} color="#f59e0b" style={{ margin: '0 auto 0.75rem' }} />
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    No Active Movement Session
                  </h4>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    The warden has not opened a movement session right now. Movement sessions (College OUT/IN, Outpass, Leave) are initiated on the warden display.
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '0.875rem',
                    marginBottom: '1rem',
                    textAlign: 'left',
                    fontSize: '0.8rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Active Session:</span>
                      <span className="badge badge-in-hostel" style={{ fontSize: '0.7rem' }}>OPEN</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>
                      {activeSession.title}
                    </div>
                    {/* Device Binding Status Pill */}
                    <div style={{
                      marginTop: '0.625rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px dashed var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>📱 Device:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {student?.registered_device_name || 'Bound to Current Device'}
                        </strong>
                      </span>
                      <span style={{
                        background: '#ecfdf5',
                        color: '#059669',
                        fontWeight: 700,
                        padding: '0.1rem 0.45rem',
                        borderRadius: 9999,
                        border: '1px solid #a7f3d0'
                      }}>
                        🛡️ Anti-Proxy Lock Active
                      </span>
                    </div>
                  </div>

                  {/* Camera Viewport */}
                  <div style={{ position: 'relative', marginBottom: '1rem' }}>
                    <div
                      id="qr-reader-viewport"
                      style={{
                        width: '100%',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        background: '#0f172a',
                        minHeight: cameraActive ? 260 : 180,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {!cameraActive && (
                        <div style={{ color: '#94a3b8', padding: '1.5rem', textAlign: 'center' }}>
                          <Camera size={44} style={{ margin: '0 auto 0.75rem', opacity: 0.6 }} />
                          <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                            Point your mobile phone camera at the active dynamic QR screen
                          </p>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={startCamera}
                            style={{ marginTop: '0.75rem' }}
                          >
                            <Camera size={15} /> Open Mobile Camera
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* Error Alert Box */}
              {errorMsg && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  marginTop: '1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  textAlign: 'left'
                }}>
                  <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: '0.8rem', color: '#991b1b', lineHeight: 1.4 }}>
                    {errorMsg}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {scanResult ? (
            <button className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
              Done
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
