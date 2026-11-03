import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Users, Search, Filter, Phone, Mail, Home, BookOpen,
  Calendar, Edit3, Clock, AlertTriangle, CheckCircle2, X, ShieldAlert
} from 'lucide-react';

export function StudentDirectory() {
  const [students, setStudents] = useState([]);
  const [yearStats, setYearStats] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Selected Student Drawer
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentHistory, setStudentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Manual Override Form State
  const [isOverriding, setIsOverriding] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState('IN_HOSTEL');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideFeedback, setOverrideFeedback] = useState(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const data = await api.getStudents({
        year: selectedYear,
        status: selectedStatus,
        search
      });
      setStudents(data.students || []);
      setYearStats(data.yearStats || []);
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [selectedYear, selectedStatus, search]);

  const openStudentDetails = async (s) => {
    setSelectedStudent(s);
    setOverrideStatus(s.current_status);
    setOverrideReason('');
    setIsOverriding(false);
    setOverrideFeedback(null);
    setLoadingHistory(true);

    try {
      const hData = await api.getMovementHistory({ studentId: s.id, limit: 15 });
      setStudentHistory(hData.records || []);
    } catch (err) {
      console.error('Failed to fetch movement history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleResetDevice = async (studentId) => {
    if (!window.confirm('Reset this student’s phone binding? They will be able to register a new phone on their next scan.')) return;
    try {
      await api.resetStudentDevice(studentId);
      setOverrideFeedback({ type: 'success', text: 'Device binding successfully reset.' });
      fetchStudents();
      setSelectedStudent(prev => prev ? { ...prev, registered_device_id: null, registered_device_name: null } : null);
    } catch (err) {
      setOverrideFeedback({ type: 'error', text: 'Failed to reset device: ' + err.message });
    }
  };

  const handleManualOverride = async (e) => {
    e.preventDefault();
    if (!overrideReason) {
      setOverrideFeedback({ type: 'error', text: 'Audit reason is required for administrative status override.' });
      return;
    }

    setOverrideSubmitting(true);
    setOverrideFeedback(null);

    try {
      await api.manualOverride({
        student_id: selectedStudent.id,
        new_status: overrideStatus,
        reason: overrideReason
      });

      setOverrideFeedback({ type: 'success', text: `Status updated to ${overrideStatus}. Logged in audit registry.` });
      setIsOverriding(false);
      fetchStudents();
      // Refresh current student state
      setSelectedStudent(prev => ({ ...prev, current_status: overrideStatus }));
      // Reload history
      const hData = await api.getMovementHistory({ studentId: selectedStudent.id, limit: 15 });
      setStudentHistory(hData.records || []);
    } catch (err) {
      setOverrideFeedback({ type: 'error', text: err.message });
    } finally {
      setOverrideSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.25rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Student Directory & Movement Register
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Manage 75 registered students across First to Fourth Year with live statuses and audit logs
          </p>
        </div>
      </div>

      {/* Year-wise Headline Breakdown */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.5rem'
      }}>
        {yearStats.map((ys) => (
          <div
            key={ys.year}
            onClick={() => setSelectedYear(selectedYear === ys.year ? 'ALL' : ys.year)}
            style={{
              background: selectedYear === ys.year ? 'var(--primary-subtle)' : '#ffffff',
              border: selectedYear === ys.year ? '2px solid var(--primary)' : '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.875rem 1rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {ys.year}
              </span>
              <span style={{
                fontSize: '0.75rem', fontWeight: 700, background: '#f1f5f9',
                padding: '0.15rem 0.45rem', borderRadius: 9999
              }}>
                {ys.total} Students
              </span>
            </div>

            <div style={{
              display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)'
            }}>
              <span style={{ color: 'var(--success)' }}>🟢 {ys.in_hostel || 0} In</span>
              <span>•</span>
              <span style={{ color: 'var(--warning)' }}>🎓 {ys.at_college || 0} Out</span>
              <span>•</span>
              <span style={{ color: 'var(--purple)' }}>🏠 {ys.on_leave || 0} Leave</span>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '2', minWidth: 220, position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 12 }} />
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Search by student name, room (e.g. E104), admission ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ flex: '1', minWidth: 160 }}>
            <select
              className="form-control"
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
            >
              <option value="ALL">All Academic Years</option>
              <option value="First Year">First Year</option>
              <option value="Second Year">Second Year</option>
              <option value="Third Year">Third Year</option>
              <option value="Fourth Year">Fourth Year</option>
            </select>
          </div>

          <div style={{ flex: '1', minWidth: 160 }}>
            <select
              className="form-control"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
            >
              <option value="ALL">All Current Statuses</option>
              <option value="IN_HOSTEL">In Hostel</option>
              <option value="AT_COLLEGE">At College</option>
              <option value="ON_WEEKEND_LEAVE">On Weekend Leave</option>
              <option value="ON_OUTPASS">On Outpass</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>
        </div>
      </div>

      {/* Students Data Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Room</th>
              <th>Student Name</th>
              <th>Admission ID</th>
              <th>Year</th>
              <th>Department</th>
              <th>Live Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                  No students found matching current filters.
                </td>
              </tr>
            ) : (
              students.map(s => (
                <tr
                  key={s.id}
                  onClick={() => openStudentDetails(s)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                    {s.room_number}
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.full_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.email}</div>
                  </td>
                  <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {s.admission_id}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{s.year}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.department}</td>
                  <td>
                    <StatusBadge status={s.current_status} />
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => { e.stopPropagation(); openStudentDetails(s); }}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Student Details & Manual Status Override Drawer Modal */}
      {selectedStudent && (
        <div className="modal-overlay" onClick={() => setSelectedStudent(null)}>
          <div className="modal-card" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-md)',
                  background: 'var(--primary-subtle)', color: 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Users size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    {selectedStudent.full_name}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Room {selectedStudent.room_number} • {selectedStudent.admission_id}
                  </div>
                </div>
              </div>

              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedStudent(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {/* Profile Card Summary */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-lg)',
                padding: '1rem',
                marginBottom: '1.25rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Current Status:
                  </span>
                  <StatusBadge status={selectedStudent.current_status} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div><strong>Department:</strong> {selectedStudent.department}</div>
                  <div><strong>Academic Year:</strong> {selectedStudent.year}</div>
                  <div><strong>Student Phone:</strong> {selectedStudent.phone || 'N/A'}</div>
                  <div><strong>Parent Contact:</strong> {selectedStudent.parent_phone}</div>
                </div>

                <div style={{
                  marginTop: '0.75rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  fontSize: '0.8rem'
                }}>
                  <div>
                    <strong style={{ color: 'var(--text-secondary)' }}>📱 Registered Hardware Device:</strong>{' '}
                    <span style={{ fontWeight: 600, color: selectedStudent.registered_device_id ? '#059669' : '#64748b' }}>
                      {selectedStudent.registered_device_name || selectedStudent.registered_device_id || 'Unbound (Binds on 1st personal scan)'}
                    </span>
                  </div>
                  {selectedStudent.registered_device_id && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', borderColor: '#fca5a5', color: '#b91c1c' }}
                      onClick={() => handleResetDevice(selectedStudent.id)}
                    >
                      Reset Phone Binding
                    </button>
                  )}
                </div>
              </div>

              {overrideFeedback && (
                <div className={`alert ${overrideFeedback.type === 'success' ? 'badge-in-hostel' : 'alert-warning'}`} style={{ marginBottom: '1rem' }}>
                  {overrideFeedback.text}
                </div>
              )}

              {/* Administrative Status Override Section */}
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                marginBottom: '1.25rem',
                background: isOverriding ? '#fffbeb' : '#ffffff'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={18} color="var(--primary)" />
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      Warden Status Override (Audit Controlled)
                    </span>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsOverriding(!isOverriding)}
                  >
                    {isOverriding ? 'Cancel Override' : 'Override Status'}
                  </button>
                </div>

                {isOverriding && (
                  <form onSubmit={handleManualOverride} style={{ marginTop: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">New Status *</label>
                      <select
                        className="form-control"
                        value={overrideStatus}
                        onChange={e => setOverrideStatus(e.target.value)}
                      >
                        <option value="IN_HOSTEL">IN_HOSTEL</option>
                        <option value="AT_COLLEGE">AT_COLLEGE</option>
                        <option value="ON_WEEKEND_LEAVE">ON_WEEKEND_LEAVE</option>
                        <option value="ON_OUTPASS">ON_OUTPASS</option>
                        <option value="OVERDUE">OVERDUE</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Mandatory Audit Reason *</label>
                      <textarea
                        className="form-control"
                        placeholder="State reason (e.g. Student reported directly to warden office after bus breakdown, phone battery dead)..."
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        required
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        This override will be permanently logged in the immutable audit log with your warden signature.
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="btn btn-danger btn-sm"
                      disabled={overrideSubmitting}
                      style={{ width: '100%', marginTop: '0.5rem', fontWeight: 700 }}
                    >
                      {overrideSubmitting ? 'Recording in Audit Log...' : 'Confirm Administrative Override'}
                    </button>
                  </form>
                )}
              </div>

              {/* Movement History for this Student */}
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  Recent Verified Movements
                </h4>

                {loadingHistory ? (
                  <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Loading history...
                  </div>
                ) : studentHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No recorded movements for this student yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 200, overflowY: 'auto' }}>
                    {studentHistory.map(h => (
                      <div key={h.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)',
                        fontSize: '0.78rem'
                      }}>
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {h.movement_type.replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                            ({h.source})
                          </span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {new Date(h.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
