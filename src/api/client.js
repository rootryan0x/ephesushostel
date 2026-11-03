import { getDeviceId, getDeviceName } from '../utils/device';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

function getAuthHeader() {
  const token = localStorage.getItem('ephesus_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...getAuthHeader(),
    'x-device-id': getDeviceId(),
    'x-device-name': getDeviceName(),
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Network request failed');
  }

  return data;
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  getMe: () => request('/auth/me'),
  getDemoUsers: () => request('/auth/demo-users'),

  // Movement
  getActiveSession: () => request('/movement/active-session'),
  startSession: (movement_type, title, token_interval_seconds) => request('/movement/session/start', {
    method: 'POST',
    body: JSON.stringify({ movement_type, title, token_interval_seconds })
  }),
  pauseSession: () => request('/movement/session/pause', { method: 'POST' }),
  resumeSession: () => request('/movement/session/resume', { method: 'POST' }),
  endSession: () => request('/movement/session/end', { method: 'POST' }),
  getSessionToken: (sessionId) => request(`/movement/session/${sessionId}/token`),
  getSessionLiveStats: (sessionId) => request(`/movement/session/${sessionId}/live-stats`),
  scanQR: (payload) => {
    const body = typeof payload === 'string'
      ? { token: payload, device_id: getDeviceId(), device_name: getDeviceName() }
      : { device_id: getDeviceId(), device_name: getDeviceName(), ...payload };
    return request('/movement/scan', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  getMovementHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/movement/history${query ? `?${query}` : ''}`);
  },
  manualOverride: (data) => request('/movement/manual-override', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Leave
  applyLeave: (data) => request('/leave/apply', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getMyLeaves: () => request('/leave/my'),
  getAllLeaves: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/leave/all${query ? `?${query}` : ''}`);
  },
  actionLeave: (id, action, remarks) => request(`/leave/${id}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, remarks })
  }),
  cancelLeave: (id) => request(`/leave/${id}/cancel`, {
    method: 'POST'
  }),

  // Outpass
  applyOutpass: (data) => request('/outpass/apply', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getMyOutpasses: () => request('/outpass/my'),
  getAllOutpasses: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/outpass/all${query ? `?${query}` : ''}`);
  },
  actionOutpass: (id, action, remarks) => request(`/outpass/${id}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, remarks })
  }),
  cancelOutpass: (id) => request(`/outpass/${id}/cancel`, {
    method: 'POST'
  }),

  // Return Confirmation
  getPendingReturnConfirm: () => request('/return-confirm/pending'),
  submitReturnConfirm: (data) => request('/return-confirm/submit', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getWardenReturnConfirmOverview: () => request('/return-confirm/warden-overview'),

  // Mess & Food Waste
  getMessDashboard: () => request('/mess/dashboard'),
  getFoodWaste: () => request('/mess/food-waste'),
  logFoodWaste: (data) => request('/mess/food-waste', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Facilities
  getFacilities: () => request('/facilities'),
  updateFacility: (key, data) => request(`/facilities/${key}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  // Bus
  getBusSchedules: () => request('/bus'),
  addBusSchedule: (data) => request('/bus', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateBusSchedule: (id, data) => request(`/bus/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteBusSchedule: (id) => request(`/bus/${id}`, { method: 'DELETE' }),

  // Announcements
  getAnnouncements: () => request('/announcements'),
  createAnnouncement: (data) => request('/announcements', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  deleteAnnouncement: (id) => request(`/announcements/${id}`, { method: 'DELETE' }),

  // Complaints
  getMyComplaints: () => request('/complaints/my'),
  getAllComplaints: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/complaints/all${query ? `?${query}` : ''}`);
  },
  submitComplaint: (data) => {
    if (data instanceof FormData) {
      return request('/complaints', { method: 'POST', body: data });
    }
    return request('/complaints', { method: 'POST', body: JSON.stringify(data) });
  },
  updateComplaintStatus: (id, status, admin_notes) => request(`/complaints/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, admin_notes })
  }),

  // Warden Management
  getWardenStats: () => request('/warden/stats'),
  getStudents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/warden/students${query ? `?${query}` : ''}`);
  },
  getRooms: () => request('/warden/rooms'),
  getConfig: () => request('/warden/config'),
  updateConfig: (data) => request('/warden/config', {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  getAuditLogs: () => request('/warden/audit-logs'),
  runOverdueCheck: () => request('/warden/run-overdue-check', { method: 'POST' }),
  getOverdueStudents: () => request('/warden/overdue-students'),
  resetStudentDevice: (id) => request(`/warden/students/${id}/reset-device`, { method: 'POST' }),
  getSecurityAlerts: () => request('/warden/security-alerts'),

  // Reports
  getReportsSummary: (period) => request(`/reports/summary?period=${period}`),
  getExportUrl: (type) => `${API_BASE}/reports/export-csv?type=${type}`
};
