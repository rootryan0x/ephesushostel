const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authenticate, requireWarden } = require('../middleware/auth');

// GET /api/warden/stats (First screen command center metrics)
router.get('/stats', authenticate, requireWarden, (req, res) => {
  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;

  // Real-time student counts
  const inHostel = db.prepare(`SELECT COUNT(*) as count FROM students WHERE current_status = 'IN_HOSTEL'`).get().count;
  const atCollege = db.prepare(`SELECT COUNT(*) as count FROM students WHERE current_status = 'AT_COLLEGE'`).get().count;
  const onWeekendLeave = db.prepare(`SELECT COUNT(*) as count FROM students WHERE current_status = 'ON_WEEKEND_LEAVE'`).get().count;
  const onOutpass = db.prepare(`SELECT COUNT(*) as count FROM students WHERE current_status = 'ON_OUTPASS'`).get().count;
  const overdue = db.prepare(`SELECT COUNT(*) as count FROM students WHERE current_status = 'OVERDUE'`).get().count;

  // Pending actions requiring Warden attention
  const pendingLeaves = db.prepare(`SELECT COUNT(*) as count FROM leave_applications WHERE status = 'WARDEN_PENDING'`).get().count;
  const pendingOutpasses = db.prepare(`SELECT COUNT(*) as count FROM outpasses WHERE status = 'WARDEN_PENDING'`).get().count;
  const pendingReturnConfirmations = db.prepare(`SELECT COUNT(*) as count FROM return_confirmations WHERE status = 'PENDING'`).get().count;
  const unresolvedComplaints = db.prepare(`SELECT COUNT(*) as count FROM complaints WHERE status IN ('SUBMITTED', 'PENDING', 'IN_PROGRESS')`).get().count;

  // Active QR Session if any
  const activeSession = db.prepare(`SELECT * FROM movement_sessions WHERE status = 'ACTIVE' LIMIT 1`).get();

  // Tomorrow expected population
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const confirmedReturns = db.prepare(`
    SELECT COUNT(*) as count
    FROM return_confirmations
    WHERE scheduled_return_date = ? AND status = 'CONFIRMED'
  `).get(tomorrowStr).count;

  const tomorrowExpectedPopulation = inHostel + atCollege + onOutpass + confirmedReturns;

  // Yesterday food waste
  const yesterdayWaste = db.prepare(`SELECT waste_kg FROM daily_food_waste ORDER BY date DESC LIMIT 1`).get();

  res.json({
    totalStudents,
    inHostel,
    atCollege,
    onWeekendLeave,
    onOutpass,
    overdue,
    pendingLeaves,
    pendingOutpasses,
    pendingReturnConfirmations,
    unresolvedComplaints,
    tomorrowExpectedPopulation,
    yesterdayWasteKg: yesterdayWaste ? yesterdayWaste.waste_kg : 8.4,
    hasActiveSession: !!activeSession,
    activeSessionId: activeSession ? activeSession.id : null
  });
});

// GET /api/warden/students (Year-wise and filtered student directory)
router.get('/students', authenticate, requireWarden, (req, res) => {
  const { year, status, department, search } = req.query;

  let query = `
    SELECT s.*, u.full_name, u.email, u.phone, u.status as account_status
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (year && year !== 'ALL') {
    query += ` AND s.year = ?`;
    params.push(year);
  }

  if (status && status !== 'ALL') {
    query += ` AND s.current_status = ?`;
    params.push(status);
  }

  if (department && department !== 'ALL') {
    query += ` AND s.department = ?`;
    params.push(department);
  }

  if (search) {
    query += ` AND (u.full_name LIKE ? OR s.admission_id LIKE ? OR s.room_number LIKE ? OR u.email LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY s.room_number ASC, s.year ASC`;

  const students = db.prepare(query).all(...params);

  // Year-wise summary breakdown
  const yearStats = db.prepare(`
    SELECT year,
           COUNT(*) as total,
           SUM(CASE WHEN current_status = 'IN_HOSTEL' THEN 1 ELSE 0 END) as in_hostel,
           SUM(CASE WHEN current_status = 'AT_COLLEGE' THEN 1 ELSE 0 END) as at_college,
           SUM(CASE WHEN current_status = 'ON_WEEKEND_LEAVE' THEN 1 ELSE 0 END) as on_leave,
           SUM(CASE WHEN current_status = 'ON_OUTPASS' THEN 1 ELSE 0 END) as on_outpass
    FROM students
    GROUP BY year
  `).all();

  res.json({ students, yearStats });
});

// GET /api/warden/rooms (Room-wise status grid)
router.get('/rooms', authenticate, requireWarden, (req, res) => {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY floor ASC, room_number ASC').all();
  const students = db.prepare(`
    SELECT s.id, s.room_number, s.year, s.department, s.current_status, s.last_movement_at,
           u.full_name, u.phone, u.email
    FROM students s
    JOIN users u ON s.user_id = u.id
  `).all();

  const complaints = db.prepare(`
    SELECT room_number, COUNT(*) as count
    FROM complaints
    WHERE status IN ('SUBMITTED', 'PENDING', 'IN_PROGRESS')
    GROUP BY room_number
  `).all();

  const complaintMap = {};
  complaints.forEach(c => { complaintMap[c.room_number] = c.count; });

  const studentMap = {};
  students.forEach(s => {
    if (!studentMap[s.room_number]) studentMap[s.room_number] = [];
    studentMap[s.room_number].push(s);
  });

  const roomsWithOccupants = rooms.map(r => ({
    ...r,
    occupants: studentMap[r.room_number] || [],
    occupiedCount: (studentMap[r.room_number] || []).length,
    activeComplaints: complaintMap[r.room_number] || 0
  }));

  res.json({ rooms: roomsWithOccupants });
});

// GET /api/warden/config
router.get('/config', authenticate, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM hostel_config').all();
  const config = {};
  rows.forEach(r => { config[r.key] = r.value; });
  res.json({ config });
});

// PUT /api/warden/config
router.put('/config', authenticate, requireWarden, (req, res) => {
  const updates = req.body;
  const insertConfig = db.prepare('INSERT OR REPLACE INTO hostel_config (key, value) VALUES (?, ?)');

  const updateTx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      insertConfig.run(key, String(value));
    }
    db.prepare(`
      INSERT INTO audit_logs (performed_by, action, target_type, target_id, new_data, reason)
      VALUES (?, 'HOSTEL_CONFIG_UPDATE', 'CONFIG', 'GLOBAL', ?, 'Warden updated hostel configuration')
    `).run(req.user.id, JSON.stringify(updates));
  });

  updateTx();
  res.json({ success: true, message: 'Hostel configuration saved.' });
});

// GET /api/warden/audit-logs
router.get('/audit-logs', authenticate, requireWarden, (req, res) => {
  const logs = db.prepare(`
    SELECT a.*, u.full_name as author_name, u.role as author_role
    FROM audit_logs a
    LEFT JOIN users u ON a.performed_by = u.id
    ORDER BY a.created_at DESC
    LIMIT 200
  `).all();

  res.json({ logs });
});

// POST /api/warden/run-overdue-check (Manual trigger of Curfew Cron Worker)
const { runCurfewAudit } = require('../cron');

router.post('/run-overdue-check', authenticate, requireWarden, (req, res) => {
  try {
    const report = runCurfewAudit();
    res.json({
      success: true,
      message: `Curfew audit complete. ${report.newlyOverdueCount} newly overdue movement(s) detected.`,
      report
    });
  } catch (err) {
    console.error('Error running manual curfew check:', err);
    res.status(500).json({ error: 'Failed to run curfew audit: ' + err.message });
  }
});

// GET /api/warden/overdue-students (Detailed list of all students currently overdue)
router.get('/overdue-students', authenticate, requireWarden, (req, res) => {
  const overdueStudents = db.prepare(`
    SELECT s.id, s.admission_id, s.room_number, s.year, s.department,
           u.full_name, u.phone as student_phone, s.parent_name, s.parent_phone,
           (SELECT o.expected_in_time FROM outpasses o WHERE o.student_id = s.id AND o.status = 'OVERDUE' ORDER BY o.id DESC LIMIT 1) as outpass_expected_time,
           (SELECT o.destination FROM outpasses o WHERE o.student_id = s.id AND o.status = 'OVERDUE' ORDER BY o.id DESC LIMIT 1) as outpass_destination,
           (SELECT l.expected_return_date FROM leave_applications l WHERE l.student_id = s.id AND l.status = 'OVERDUE' ORDER BY l.id DESC LIMIT 1) as leave_expected_date
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.current_status = 'OVERDUE'
    ORDER BY s.room_number ASC
  `).all();

  res.json({
    count: overdueStudents.length,
    students: overdueStudents
  });
});

// POST /api/warden/students/:id/reset-device (Warden clears registered phone binding)
router.post('/students/:id/reset-device', authenticate, requireWarden, (req, res) => {
  const student = db.prepare(`
    SELECT s.*, u.full_name, s.room_number
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!student) {
    return res.status(404).json({ error: 'Student profile not found.' });
  }

  const oldDevice = student.registered_device_name || student.registered_device_id || 'None';

  db.prepare(`
    UPDATE students
    SET registered_device_id = NULL, registered_device_name = NULL, device_registered_at = NULL
    WHERE id = ?
  `).run(student.id);

  db.prepare(`
    INSERT INTO audit_logs (performed_by, action, target_type, target_id, original_data, new_data, reason)
    VALUES (?, 'RESET_DEVICE_BINDING', 'STUDENT', ?, ?, 'Warden verified and unlinked student device binding')
  `).run(
    req.user.id,
    String(student.id),
    JSON.stringify({ student: student.full_name, room: student.room_number, unlinkedDevice: oldDevice })
  );

  res.json({
    success: true,
    message: `Registered device binding for ${student.full_name} (${student.room_number}) has been reset.`
  });
});

// GET /api/warden/security-alerts (Real-time log of blocked proxy scans)
router.get('/security-alerts', authenticate, requireWarden, (req, res) => {
  const alerts = db.prepare(`
    SELECT al.id, al.created_at, al.action, al.reason, al.new_data,
           u.full_name as student_name, s.room_number
    FROM audit_logs al
    LEFT JOIN users u ON al.performed_by = u.id
    LEFT JOIN students s ON s.user_id = u.id
    WHERE al.action = 'PROXY_ATTEMPT_BLOCKED'
    ORDER BY al.created_at DESC
    LIMIT 30
  `).all();

  res.json({ alerts });
});

module.exports = router;
