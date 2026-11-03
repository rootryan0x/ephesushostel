const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { JWT_SECRET, authenticate, requireWarden, requireStudent } = require('../middleware/auth');

// Human friendly labels for movement types
const MOVEMENT_LABELS = {
  COLLEGE_OUT: 'Morning College OUT',
  COLLEGE_IN: 'Evening College IN',
  OUTPASS_OUT: 'Outpass Departure OUT',
  OUTPASS_IN: 'Outpass Return IN',
  LEAVE_OUT: 'Weekend / Home Leave OUT',
  LEAVE_IN: 'Weekend / Home Leave Return IN'
};

// GET /api/movement/active-session (returns current active session if any)
router.get('/active-session', authenticate, (req, res) => {
  const session = db.prepare(`
    SELECT * FROM movement_sessions
    WHERE status IN ('ACTIVE', 'PAUSED')
    ORDER BY started_at DESC LIMIT 1
  `).get();

  if (!session) {
    return res.json({ session: null });
  }

  // Calculate live count
  const completedCount = db.prepare(`
    SELECT COUNT(DISTINCT student_id) as count
    FROM movement_records
    WHERE session_id = ?
  `).get(session.id).count;

  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;

  res.json({
    session: {
      ...session,
      label: MOVEMENT_LABELS[session.movement_type] || session.movement_type,
      completedCount,
      totalStudents
    }
  });
});

// POST /api/movement/session/start (Warden starts a new session)
router.post('/session/start', authenticate, requireWarden, async (req, res) => {
  const { movement_type, title, token_interval_seconds = 3 } = req.body;

  if (!movement_type || !MOVEMENT_LABELS[movement_type]) {
    return res.status(400).json({ error: 'Valid movement type is required.' });
  }

  // End any previously active session
  db.prepare(`
    UPDATE movement_sessions
    SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
    WHERE status IN ('ACTIVE', 'PAUSED')
  `).run();

  const sessionId = `SES_${movement_type}_${Date.now()}`;
  const sessionTitle = title || MOVEMENT_LABELS[movement_type];

  db.prepare(`
    INSERT INTO movement_sessions (id, movement_type, title, status, created_by, token_interval_seconds)
    VALUES (?, ?, ?, 'ACTIVE', ?, ?)
  `).run(sessionId, movement_type, sessionTitle, req.user.id, token_interval_seconds);

  // Log in audit log
  db.prepare(`
    INSERT INTO audit_logs (performed_by, action, target_type, target_id, new_data, reason)
    VALUES (?, 'SESSION_START', 'MOVEMENT_SESSION', ?, ?, 'Warden initiated dynamic QR session')
  `).run(req.user.id, sessionId, JSON.stringify({ movement_type, sessionTitle }));

  res.json({
    success: true,
    sessionId,
    movement_type,
    title: sessionTitle
  });
});

// POST /api/movement/session/pause
router.post('/session/pause', authenticate, requireWarden, (req, res) => {
  const session = db.prepare(`SELECT * FROM movement_sessions WHERE status = 'ACTIVE' LIMIT 1`).get();
  if (!session) {
    return res.status(404).json({ error: 'No active movement session found.' });
  }

  db.prepare(`UPDATE movement_sessions SET status = 'PAUSED' WHERE id = ?`).run(session.id);
  res.json({ success: true, message: 'Session paused.' });
});

// POST /api/movement/session/resume
router.post('/session/resume', authenticate, requireWarden, (req, res) => {
  const session = db.prepare(`SELECT * FROM movement_sessions WHERE status = 'PAUSED' LIMIT 1`).get();
  if (!session) {
    return res.status(404).json({ error: 'No paused movement session found.' });
  }

  db.prepare(`UPDATE movement_sessions SET status = 'ACTIVE' WHERE id = ?`).run(session.id);
  res.json({ success: true, message: 'Session resumed.' });
});

// POST /api/movement/session/end
router.post('/session/end', authenticate, requireWarden, (req, res) => {
  const session = db.prepare(`SELECT * FROM movement_sessions WHERE status IN ('ACTIVE', 'PAUSED') LIMIT 1`).get();
  if (!session) {
    return res.status(404).json({ error: 'No active or paused movement session found.' });
  }

  db.prepare(`
    UPDATE movement_sessions
    SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(session.id);

  res.json({ success: true, message: 'Movement session completed.' });
});

// GET /api/movement/session/:id/token (Generates fresh dynamic QR token)
router.get('/session/:id/token', authenticate, async (req, res) => {
  const session = db.prepare(`SELECT * FROM movement_sessions WHERE id = ?`).get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  if (session.status !== 'ACTIVE') {
    return res.status(400).json({ error: `Session is currently ${session.status.toLowerCase()}.` });
  }

  const now = Date.now();
  const interval = session.token_interval_seconds || 3;
  const tokenPayload = {
    sessionId: session.id,
    movementType: session.movement_type,
    hostel: 'EPHESUS',
    timestamp: now,
    nonce: uuidv4()
  };

  // Ultra-short lived token (15s max life, rotates every 3s)
  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '15s' });

  // Generate QR code data URL
  const qrDataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: {
      dark: '#1e1b4b',
      light: '#ffffff'
    },
    width: 320
  });

  res.json({
    token,
    qrDataUrl,
    intervalSeconds: interval,
    generatedAt: now,
    expiresAt: now + (interval * 1000)
  });
});

// GET /api/movement/session/:id/live-stats (Live count and completed vs pending student list)
router.get('/session/:id/live-stats', authenticate, (req, res) => {
  const session = db.prepare(`SELECT * FROM movement_sessions WHERE id = ?`).get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;

  // Completed students in this session
  const completedRecords = db.prepare(`
    SELECT mr.id, mr.timestamp, mr.source,
           s.id as student_id, s.room_number, s.department, s.year,
           u.full_name, u.email
    FROM movement_records mr
    JOIN students s ON mr.student_id = s.id
    JOIN users u ON s.user_id = u.id
    WHERE mr.session_id = ?
    ORDER BY mr.timestamp DESC
  `).all(session.id);

  const completedStudentIds = new Set(completedRecords.map(r => r.student_id));

  // Approved leave students (useful for College OUT context)
  const onLeaveStudents = db.prepare(`
    SELECT s.id as student_id, s.room_number, s.department, s.year,
           u.full_name, u.email
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.current_status = 'ON_WEEKEND_LEAVE'
  `).all();

  // Pending students (neither scanned nor on leave)
  const pendingStudents = db.prepare(`
    SELECT s.id as student_id, s.room_number, s.department, s.year,
           s.current_status, u.full_name, u.email
    FROM students s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.room_number ASC
  `).all().filter(s => !completedStudentIds.has(s.student_id));

  // Blocked proxy attempts during this session
  const blockedProxyCount = db.prepare(`
    SELECT COUNT(*) as count FROM audit_logs
    WHERE action = 'PROXY_ATTEMPT_BLOCKED'
      AND created_at >= (SELECT started_at FROM movement_sessions WHERE id = ?)
  `).get(session.id)?.count || 0;

  res.json({
    sessionId: session.id,
    movementType: session.movement_type,
    label: MOVEMENT_LABELS[session.movement_type] || session.movement_type,
    status: session.status,
    totalStudents,
    completedCount: completedRecords.length,
    pendingCount: pendingStudents.length,
    onLeaveCount: onLeaveStudents.length,
    blockedProxyCount,
    completed: completedRecords,
    pending: pendingStudents,
    onLeave: onLeaveStudents
  });
});

// POST /api/movement/scan (Student submits QR scan with device binding & anti-proxy guard)
router.post('/scan', authenticate, requireStudent, (req, res) => {
  const { token, device_id, device_name } = req.body;
  const student = req.student;

  if (!token) {
    return res.status(400).json({ error: 'No QR code payload received.' });
  }

  // 1. Resolve client hardware device identifier
  const deviceId = (device_id || req.headers['x-device-id'] || '').trim();
  const deviceName = (device_name || req.headers['x-device-name'] || 'Mobile Browser').trim();

  // 2. Verify JWT signature
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(400).json({
      error: 'Invalid or expired QR code. Please scan the currently active code displayed on the warden screen.'
    });
  }

  // 3. Validate Ephesus Hostel origin
  if (decoded.hostel !== 'EPHESUS') {
    return res.status(400).json({
      error: 'This QR code does not belong to Ephesus Hostel, Providence College of Engineering.'
    });
  }

  // 4. Verify session exists and is ACTIVE
  const session = db.prepare('SELECT * FROM movement_sessions WHERE id = ?').get(decoded.sessionId);
  if (!session) {
    return res.status(400).json({ error: 'Movement session does not exist or has closed.' });
  }

  if (session.status !== 'ACTIVE') {
    return res.status(400).json({
      error: `This movement session is currently ${session.status.toLowerCase()} by the warden. Scans cannot be accepted right now.`
    });
  }

  // 5. Verify token freshness (Ultra-strict 3s rolling window + 3s network latency allowance)
  const tokenAgeMs = Date.now() - decoded.timestamp;
  const intervalSec = session.token_interval_seconds || 3;
  const maxAllowedAgeMs = (intervalSec + 3) * 1000;
  if (tokenAgeMs > maxAllowedAgeMs) {
    return res.status(400).json({
      error: `This dynamic QR code has expired (${intervalSec}s rolling token). Taking photos or forwarding QR codes is strictly prevented. Please scan the live display.`
    });
  }

  // 6. ANTI-PROXY GUARD #1: Physical Device Session Lockout (Preventing 1 phone from scanning for multiple students)
  if (deviceId) {
    const existingDeviceScan = db.prepare(`
      SELECT mr.*, u.full_name as previous_student_name, s.room_number as previous_room
      FROM movement_records mr
      JOIN students s ON mr.student_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE mr.session_id = ? AND mr.device_id = ?
    `).get(session.id, deviceId);

    if (existingDeviceScan) {
      // Log blocked proxy attempt in audit logs
      db.prepare(`
        INSERT INTO audit_logs (performed_by, action, target_type, target_id, new_data, reason)
        VALUES (?, 'PROXY_ATTEMPT_BLOCKED', 'STUDENT', ?, ?, 'Multiple student scan attempt from identical physical device')
      `).run(
        req.user.id,
        String(student.id),
        JSON.stringify({
          attemptedBy: req.user.full_name,
          previousStudent: existingDeviceScan.previous_student_name,
          deviceId,
          deviceName,
          sessionId: session.id
        })
      );

      return res.status(409).json({
        error: `🚨 PROXY ATTENDANCE BLOCKED: This physical device has already registered attendance for ${existingDeviceScan.previous_student_name} (${existingDeviceScan.previous_room}) in this session. Each student must scan individually from their own personal device.`
      });
    }

    // 7. ANTI-PROXY GUARD #2: Strict 1-to-1 Device-to-Student Registration Binding
    // A) Check if this physical device is registered to a DIFFERENT student
    const deviceBoundOther = db.prepare(`
      SELECT s.*, u.full_name, s.room_number
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.registered_device_id = ? AND s.id != ?
    `).get(deviceId, student.id);

    if (deviceBoundOther) {
      db.prepare(`
        INSERT INTO audit_logs (performed_by, action, target_type, target_id, new_data, reason)
        VALUES (?, 'PROXY_ATTEMPT_BLOCKED', 'STUDENT', ?, ?, 'Cross-student device sharing detected')
      `).run(
        req.user.id,
        String(student.id),
        JSON.stringify({
          attemptedStudent: req.user.full_name,
          boundStudent: deviceBoundOther.full_name,
          boundRoom: deviceBoundOther.room_number,
          deviceId
        })
      );

      return res.status(403).json({
        error: `🚨 PROXY SCAN DETECTED: This physical device is registered to ${deviceBoundOther.full_name} (${deviceBoundOther.room_number}). Login sharing to scan attendance on a peer's phone is strictly prohibited.`
      });
    }

    // B) Check if this student's account is already bound to a DIFFERENT physical device
    if (student.registered_device_id && student.registered_device_id !== deviceId) {
      db.prepare(`
        INSERT INTO audit_logs (performed_by, action, target_type, target_id, new_data, reason)
        VALUES (?, 'PROXY_ATTEMPT_BLOCKED', 'STUDENT', ?, ?, 'Student attempted scan from unregistered secondary device')
      `).run(
        req.user.id,
        String(student.id),
        JSON.stringify({
          student: req.user.full_name,
          registeredDevice: student.registered_device_name || student.registered_device_id,
          attemptedDevice: deviceName
        })
      );

      return res.status(403).json({
        error: `🚨 UNREGISTERED DEVICE: Your account is permanently bound to "${student.registered_device_name || 'your primary device'}". If you have changed your phone, please contact the Chief Warden to reset your registered device.`
      });
    }

    // C) First-time scan: Permanently bind this device to the student profile
    if (!student.registered_device_id) {
      db.prepare(`
        UPDATE students
        SET registered_device_id = ?, registered_device_name = ?, device_registered_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(deviceId, deviceName, student.id);
    }
  }

  // 8. Prevent duplicate student scans in the same session
  const existingRecord = db.prepare(`
    SELECT * FROM movement_records
    WHERE session_id = ? AND student_id = ?
  `).get(session.id, student.id);

  if (existingRecord) {
    const scanTime = new Date(existingRecord.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
    return res.status(409).json({
      error: `You have already verified your movement for this session at ${scanTime}. Duplicate scans are not permitted.`
    });
  }

  const movementType = session.movement_type;
  let newStatus = student.current_status;
  let direction = 'OUT';
  let relatedLeaveId = null;
  let relatedOutpassId = null;

  // 6. Strict State Machine Transition Checks
  switch (movementType) {
    case 'COLLEGE_OUT':
      direction = 'OUT';
      if (student.current_status !== 'IN_HOSTEL') {
        return res.status(400).json({
          error: `Cannot record College OUT. Your current status is "${student.current_status}". You must be marked IN_HOSTEL.`
        });
      }
      newStatus = 'AT_COLLEGE';
      break;

    case 'COLLEGE_IN':
      direction = 'IN';
      if (student.current_status !== 'AT_COLLEGE') {
        return res.status(400).json({
          error: `Cannot record College IN. Your current status is "${student.current_status}". You must be marked AT_COLLEGE to check back in from college.`
        });
      }
      newStatus = 'IN_HOSTEL';
      break;

    case 'OUTPASS_OUT':
      direction = 'OUT';
      if (student.current_status !== 'IN_HOSTEL') {
        return res.status(400).json({
          error: `Cannot record Outpass OUT. You are currently marked as "${student.current_status}".`
        });
      }
      // Check for approved outpass
      const activeApprovedOutpass = db.prepare(`
        SELECT * FROM outpasses
        WHERE student_id = ? AND status = 'APPROVED'
        ORDER BY id DESC LIMIT 1
      `).get(student.id);

      if (!activeApprovedOutpass) {
        return res.status(400).json({
          error: 'You do not have an approved outpass. Please apply and obtain warden approval before scanning Outpass OUT.'
        });
      }
      relatedOutpassId = activeApprovedOutpass.id;
      newStatus = 'ON_OUTPASS';
      break;

    case 'OUTPASS_IN':
      direction = 'IN';
      if (student.current_status !== 'ON_OUTPASS' && student.current_status !== 'OVERDUE') {
        return res.status(400).json({
          error: `Cannot record Outpass IN. You are not currently marked ON_OUTPASS or OVERDUE (Status: ${student.current_status}).`
        });
      }
      const ongoingOutpass = db.prepare(`
        SELECT * FROM outpasses
        WHERE student_id = ? AND status IN ('ACTIVE', 'OVERDUE', 'APPROVED')
        ORDER BY id DESC LIMIT 1
      `).get(student.id);

      if (ongoingOutpass) {
        relatedOutpassId = ongoingOutpass.id;
        db.prepare(`UPDATE outpasses SET status = 'RETURNED', actual_in_time = CURRENT_TIMESTAMP WHERE id = ?`).run(ongoingOutpass.id);
      }
      newStatus = 'IN_HOSTEL';
      break;

    case 'LEAVE_OUT':
      direction = 'OUT';
      // Route A (Hostel -> Home) or Route B (Friday College -> Home directly)
      if (student.current_status !== 'IN_HOSTEL' && student.current_status !== 'AT_COLLEGE') {
        return res.status(400).json({
          error: `Cannot record Leave OUT. Your current status is "${student.current_status}". Must be IN_HOSTEL or AT_COLLEGE.`
        });
      }

      // Check for approved leave
      const approvedLeave = db.prepare(`
        SELECT * FROM leave_applications
        WHERE student_id = ? AND status = 'APPROVED'
        ORDER BY id DESC LIMIT 1
      `).get(student.id);

      if (!approvedLeave) {
        return res.status(400).json({
          error: 'You do not have an approved weekend/home leave application. Please apply and obtain warden approval first.'
        });
      }
      relatedLeaveId = approvedLeave.id;
      newStatus = 'ON_WEEKEND_LEAVE';
      break;

    case 'LEAVE_IN':
      direction = 'IN';
      if (student.current_status !== 'ON_WEEKEND_LEAVE' && student.current_status !== 'OVERDUE') {
        return res.status(400).json({
          error: `Cannot record Leave Return IN. You are not currently on approved leave or overdue (Status: ${student.current_status}).`
        });
      }

      const activeLeave = db.prepare(`
        SELECT * FROM leave_applications
        WHERE student_id = ? AND status IN ('ACTIVE', 'APPROVED', 'OVERDUE')
        ORDER BY id DESC LIMIT 1
      `).get(student.id);

      if (activeLeave) {
        relatedLeaveId = activeLeave.id;
        db.prepare(`UPDATE leave_applications SET status = 'RETURNED', actual_in_time = CURRENT_TIMESTAMP WHERE id = ?`).run(activeLeave.id);
      }
      newStatus = 'IN_HOSTEL';
      break;

    default:
      return res.status(400).json({ error: 'Unknown movement type.' });
  }

  // Execute database transaction
  const recordMovementTx = db.transaction(() => {
    // 1. Insert movement record with physical device audit
    db.prepare(`
      INSERT INTO movement_records (
        student_id, movement_type, direction, timestamp,
        session_id, qr_token, related_leave_id, related_outpass_id, source, device_id, device_name
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, 'QR_SCAN', ?, ?)
    `).run(
      student.id,
      movementType,
      direction,
      session.id,
      token.slice(-16), // store short hash/suffix for audit
      relatedLeaveId,
      relatedOutpassId,
      deviceId || null,
      deviceName || null
    );

    // 2. Update student status
    db.prepare(`
      UPDATE students
      SET current_status = ?, last_movement_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, student.id);

    // 3. Update related outpass or leave status
    if (movementType === 'OUTPASS_OUT' && relatedOutpassId) {
      db.prepare(`
        UPDATE outpasses
        SET status = 'ACTIVE', actual_out_time = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(relatedOutpassId);
    } else if (movementType === 'OUTPASS_IN' && relatedOutpassId) {
      db.prepare(`
        UPDATE outpasses
        SET status = 'RETURNED', actual_in_time = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(relatedOutpassId);
    } else if (movementType === 'LEAVE_OUT' && relatedLeaveId) {
      db.prepare(`
        UPDATE leave_applications
        SET status = 'ACTIVE', actual_out_time = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(relatedLeaveId);
    } else if (movementType === 'LEAVE_IN' && relatedLeaveId) {
      db.prepare(`
        UPDATE leave_applications
        SET status = 'RETURNED', actual_in_time = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(relatedLeaveId);
    }
  });

  try {
    recordMovementTx();
  } catch (err) {
    console.error('Movement transaction failed:', err);
    return res.status(500).json({ error: 'Failed to record movement. Please try again.' });
  }

  const nowFormatted = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });

  return res.json({
    success: true,
    movementType,
    label: MOVEMENT_LABELS[movementType],
    timestamp: nowFormatted,
    newStatus,
    student: {
      name: req.user.full_name,
      room: student.room_number,
      admissionId: student.admission_id
    }
  });
});

// GET /api/movement/history
router.get('/history', authenticate, (req, res) => {
  let records;
  if (req.user.role === 'STUDENT') {
    records = db.prepare(`
      SELECT mr.*, ms.title as session_title
      FROM movement_records mr
      LEFT JOIN movement_sessions ms ON mr.session_id = ms.id
      WHERE mr.student_id = ?
      ORDER BY mr.timestamp DESC
      LIMIT 100
    `).all(req.student.id);
  } else {
    const { studentId, limit = 150 } = req.query;
    if (studentId) {
      records = db.prepare(`
        SELECT mr.*, s.room_number, u.full_name, ms.title as session_title
        FROM movement_records mr
        JOIN students s ON mr.student_id = s.id
        JOIN users u ON s.user_id = u.id
        LEFT JOIN movement_sessions ms ON mr.session_id = ms.id
        WHERE mr.student_id = ?
        ORDER BY mr.timestamp DESC
        LIMIT ?
      `).all(studentId, parseInt(limit));
    } else {
      records = db.prepare(`
        SELECT mr.*, s.room_number, u.full_name, ms.title as session_title
        FROM movement_records mr
        JOIN students s ON mr.student_id = s.id
        JOIN users u ON s.user_id = u.id
        LEFT JOIN movement_sessions ms ON mr.session_id = ms.id
        ORDER BY mr.timestamp DESC
        LIMIT ?
      `).all(parseInt(limit));
    }
  }

  res.json({ records });
});

// POST /api/movement/manual-override (Warden manual status change with audit trail)
router.post('/manual-override', authenticate, requireWarden, (req, res) => {
  const { student_id, new_status, reason, movement_type } = req.body;

  if (!student_id || !new_status || !reason) {
    return res.status(400).json({ error: 'Student ID, new status, and audit reason are required.' });
  }

  const validStatuses = ['IN_HOSTEL', 'AT_COLLEGE', 'ON_OUTPASS', 'ON_WEEKEND_LEAVE', 'OVERDUE'];
  if (!validStatuses.includes(new_status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const student = db.prepare(`
    SELECT s.*, u.full_name, u.email
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(student_id);

  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  const prevStatus = student.current_status;

  const overrideTx = db.transaction(() => {
    // 1. Update student status
    db.prepare(`
      UPDATE students
      SET current_status = ?, last_movement_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(new_status, student_id);

    // 2. Insert movement record flagged as WARDEN_OVERRIDE
    const inferredType = movement_type || (new_status === 'IN_HOSTEL' ? 'COLLEGE_IN' : 'COLLEGE_OUT');
    const direction = new_status === 'IN_HOSTEL' ? 'IN' : 'OUT';

    db.prepare(`
      INSERT INTO movement_records (
        student_id, movement_type, direction, timestamp,
        is_override, override_by, override_reason, source
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1, ?, ?, 'WARDEN_OVERRIDE')
    `).run(student_id, inferredType, direction, req.user.id, reason);

    // 3. Create mandatory immutable audit log
    db.prepare(`
      INSERT INTO audit_logs (
        performed_by, action, target_type, target_id,
        original_data, new_data, reason
      ) VALUES (?, 'MANUAL_STATUS_OVERRIDE', 'STUDENT', ?, ?, ?, ?)
    `).run(
      req.user.id,
      String(student_id),
      JSON.stringify({ previous_status: prevStatus }),
      JSON.stringify({ new_status }),
      `Manual status correction by ${req.user.full_name}: ${reason}`
    );
  });

  overrideTx();

  res.json({
    success: true,
    message: `Status for ${student.full_name} manually updated from ${prevStatus} to ${new_status}. Recorded in audit log.`
  });
});

module.exports = router;
