import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserCheck, Shield, GraduationCap, X, AlertTriangle, Smartphone } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { setSimulatedDeviceForUser, toggleProxySimulation, isProxySimulationActive } from '../utils/device';

export function QuickRoleSwitch({ isOpen, onClose }) {
  const { user, switchDemoUser } = useAuth();

  if (!isOpen) return null;

  const demoAccounts = [
    {
      category: 'Warden & Staff Administration',
      users: [
        {
          name: 'Prof. K. Abraham',
          email: 'warden@providence.edu.in',
          role: 'Chief Warden',
          sub: 'Providence College of Engineering',
          icon: Shield,
          color: '#4f46e5'
        },
        {
          name: 'Asst. Prof. Mathew Varghese',
          email: 'incharge@providence.edu.in',
          role: 'Assistant Warden / In-Charge',
          sub: 'Hostel Operations',
          icon: Shield,
          color: '#0284c7'
        }
      ]
    },
    {
      category: 'Student Accounts (Different Years & Live States)',
      users: [
        {
          name: 'Rahul Krishna',
          email: 'rahul.k@providence.edu.in',
          role: 'Fourth Year • Room E101',
          sub: 'Status: In Hostel (Ready for College OUT or Outpass)',
          status: 'IN_HOSTEL',
          icon: GraduationCap,
          color: '#10b981'
        },
        {
          name: 'Cyril Benny',
          email: 'cyril.b@providence.edu.in',
          role: 'Third Year • Room E205',
          sub: 'Status: At College (Ready for College IN or Friday Leave OUT)',
          status: 'AT_COLLEGE',
          icon: GraduationCap,
          color: '#f59e0b'
        },
        {
          name: 'Tony Augustine',
          email: 'tony.a@providence.edu.in',
          role: 'First Year • Room E214',
          sub: 'Status: On Weekend Leave (Sunday Return Confirm Active!)',
          status: 'ON_WEEKEND_LEAVE',
          icon: GraduationCap,
          color: '#8b5cf6'
        },
        {
          name: 'Jeffin Jacob',
          email: 'jeffin.j@providence.edu.in',
          role: 'Second Year • Room E215',
          sub: 'Status: On Outpass (Town Market visit)',
          status: 'ON_OUTPASS',
          icon: GraduationCap,
          color: '#06b6d4'
        }
      ]
    }
  ];

  const [proxyActive, setProxyActive] = useState(isProxySimulationActive());

  const handleSelect = async (email) => {
    try {
      setSimulatedDeviceForUser(email);
      await switchDemoUser(email);
      onClose();
    } catch (err) {
      alert('Failed to switch demo account: ' + err.message);
    }
  };

  const handleToggleProxyAttack = () => {
    const nextState = !proxyActive;
    toggleProxySimulation(nextState);
    setProxyActive(nextState);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--primary-subtle)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <UserCheck size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Interactive Account Switcher</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Instantly switch roles to test warden controls or student workflows
              </p>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.25rem 0.5rem' }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Judge Demonstration Control Box */}
          <div style={{
            background: proxyActive ? 'rgba(239, 68, 68, 0.1)' : 'rgba(79, 70, 229, 0.08)',
            border: proxyActive ? '1px solid #f87171' : '1px solid #c7d2fe',
            borderRadius: 'var(--radius-md)',
            padding: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.85rem', color: proxyActive ? '#b91c1c' : '#4338ca' }}>
                <Smartphone size={16} />
                <span>Judge Demo Mode: {proxyActive ? '⚠️ Proxy Attack Mode Active' : '🛡️ Individual Device Protection'}</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                {proxyActive
                  ? 'Simulating a student logging in on a friend’s phone to scan proxy attendance. Next scan will trigger instant anti-proxy rejection!'
                  : 'Each student is bound to their personal phone. Toggle this to demonstrate proxy prevention to judges.'}
              </p>
            </div>
            <button
              className={`btn btn-sm ${proxyActive ? 'btn-danger' : 'btn-secondary'}`}
              onClick={handleToggleProxyAttack}
              style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
            >
              {proxyActive ? 'Disable Attack Sim' : 'Simulate Proxy Scan'}
            </button>
          </div>

          {demoAccounts.map((grp, idx) => (
            <div key={idx}>
              <div style={{
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                color: 'var(--text-secondary)', marginBottom: '0.5rem', letterSpacing: '0.04em'
              }}>
                {grp.category}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {grp.users.map((acc, aIdx) => {
                  const isCurrent = user && user.email === acc.email;
                  const Icon = acc.icon;

                  return (
                    <div
                      key={aIdx}
                      onClick={() => handleSelect(acc.email)}
                      style={{
                        padding: '0.875rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        border: isCurrent ? '2px solid var(--primary)' : '1px solid var(--border-light)',
                        background: isCurrent ? 'var(--primary-subtle)' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = '#ffffff'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 'var(--radius-md)',
                          background: `${acc.color}15`, color: acc.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              {acc.name}
                            </span>
                            {isCurrent && (
                              <span style={{
                                fontSize: '0.65rem', background: 'var(--primary)', color: 'white',
                                padding: '0.1rem 0.4rem', borderRadius: 9999, fontWeight: 700
                              }}>ACTIVE</span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {acc.role}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                            {acc.sub}
                          </div>
                        </div>
                      </div>

                      {acc.status && <StatusBadge status={acc.status} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            All accounts use standard authentication with college email
          </span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
