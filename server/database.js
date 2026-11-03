const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'ephesus.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for high performance concurrent scans
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('STUDENT', 'WARDEN', 'ASSISTANT_WARDEN', 'IN_CHARGE', 'ADMIN')),
      full_name TEXT NOT NULL,
      phone TEXT,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Students profile table
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admission_id TEXT UNIQUE NOT NULL,
      room_number TEXT NOT NULL,
      department TEXT NOT NULL,
      year TEXT NOT NULL CHECK(year IN ('First Year', 'Second Year', 'Third Year', 'Fourth Year')),
      parent_name TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      current_status TEXT DEFAULT 'IN_HOSTEL' CHECK(current_status IN ('IN_HOSTEL', 'AT_COLLEGE', 'ON_OUTPASS', 'ON_WEEKEND_LEAVE', 'OVERDUE')),
      last_movement_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Rooms table
    CREATE TABLE IF NOT EXISTS rooms (
      room_number TEXT PRIMARY KEY,
      block TEXT DEFAULT 'Ephesus Main',
      floor INTEGER NOT NULL,
      capacity INTEGER DEFAULT 2
    );

    -- Dynamic Movement Sessions created by Warden
    CREATE TABLE IF NOT EXISTS movement_sessions (
      id TEXT PRIMARY KEY,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('COLLEGE_OUT', 'COLLEGE_IN', 'OUTPASS_OUT', 'OUTPASS_IN', 'LEAVE_OUT', 'LEAVE_IN')),
      title TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'PAUSED', 'COMPLETED')),
      created_by INTEGER REFERENCES users(id),
      token_interval_seconds INTEGER DEFAULT 3,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    -- Movement Records (Immutable audit trail of scans & overrides)
    CREATE TABLE IF NOT EXISTS movement_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('COLLEGE_OUT', 'COLLEGE_IN', 'OUTPASS_OUT', 'OUTPASS_IN', 'LEAVE_OUT', 'LEAVE_IN')),
      direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      session_id TEXT REFERENCES movement_sessions(id),
      qr_token TEXT,
      related_leave_id INTEGER,
      related_outpass_id INTEGER,
      is_override INTEGER DEFAULT 0,
      override_by INTEGER REFERENCES users(id),
      override_reason TEXT,
      source TEXT DEFAULT 'QR_SCAN' CHECK(source IN ('QR_SCAN', 'WARDEN_OVERRIDE'))
    );

    -- Outpass Applications
    CREATE TABLE IF NOT EXISTS outpasses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      destination TEXT NOT NULL,
      date TEXT NOT NULL,
      expected_out_time TEXT NOT NULL,
      expected_in_time TEXT NOT NULL,
      actual_out_time DATETIME,
      actual_in_time DATETIME,
      parent_contact TEXT NOT NULL,
      parent_confirmation_status TEXT DEFAULT 'CONFIRMED' CHECK(parent_confirmation_status IN ('PENDING', 'CONFIRMED', 'NOT_REQUIRED')),
      status TEXT DEFAULT 'WARDEN_PENDING' CHECK(status IN ('DRAFT', 'SUBMITTED', 'WARDEN_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ACTIVE', 'RETURNED', 'OVERDUE')),
      warden_remarks TEXT,
      approved_by INTEGER REFERENCES users(id),
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Weekend & Home Leave Applications
    CREATE TABLE IF NOT EXISTS leave_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      leave_type TEXT DEFAULT 'WEEKEND' CHECK(leave_type IN ('WEEKEND', 'HOME')),
      purpose TEXT NOT NULL,
      leave_start_date TEXT NOT NULL,
      expected_return_date TEXT NOT NULL,
      actual_out_time DATETIME,
      actual_in_time DATETIME,
      route_type TEXT DEFAULT 'HOSTEL_HOME' CHECK(route_type IN ('HOSTEL_HOME', 'HOSTEL_COLLEGE_HOME', 'HOME_HOSTEL_DIRECT', 'HOME_COLLEGE_HOSTEL_BUS')),
      parent_contact TEXT NOT NULL,
      parent_confirmation_status TEXT DEFAULT 'CONFIRMED' CHECK(parent_confirmation_status IN ('PENDING', 'CONFIRMED')),
      status TEXT DEFAULT 'WARDEN_PENDING' CHECK(status IN ('SUBMITTED', 'WARDEN_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ACTIVE', 'RETURNED', 'OVERDUE')),
      warden_remarks TEXT,
      approved_by INTEGER REFERENCES users(id),
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Return Confirmations (for food & population planning)
    CREATE TABLE IF NOT EXISTS return_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leave_id INTEGER NOT NULL REFERENCES leave_applications(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      scheduled_return_date TEXT NOT NULL,
      confirmed_intention TEXT CHECK(confirmed_intention IN ('CONFIRMED_RETURNING', 'EXTENDING_LEAVE')),
      new_return_date TEXT,
      extension_reason TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'CONFIRMED', 'EXTENDED', 'CANCELLED')),
      deadline_time DATETIME NOT NULL,
      submitted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Leave Extension History (Audit trail of date changes)
    CREATE TABLE IF NOT EXISTS leave_extensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leave_id INTEGER NOT NULL REFERENCES leave_applications(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      original_return_date TEXT NOT NULL,
      requested_return_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'APPROVED' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      approved_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Daily Food Waste Records
    CREATE TABLE IF NOT EXISTS daily_food_waste (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      waste_kg REAL NOT NULL,
      breakfast_kg REAL,
      lunch_kg REAL,
      dinner_kg REAL,
      notes TEXT,
      logged_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Facilities Status
    CREATE TABLE IF NOT EXISTS facilities (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      status_level TEXT NOT NULL CHECK(status_level IN ('NORMAL', 'WARNING', 'CRITICAL')),
      icon TEXT,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id)
    );

    -- Bus Schedules
    CREATE TABLE IF NOT EXISTS bus_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      bus_number TEXT NOT NULL,
      status TEXT DEFAULT 'ON_TIME' CHECK(status IN ('ON_TIME', 'DELAYED', 'CANCELLED', 'SPECIAL')),
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Announcements
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL', 'IMPORTANT', 'EMERGENCY')),
      target_audience TEXT DEFAULT 'ALL',
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Complaints
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      room_number TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('Electrical', 'Wi-Fi', 'Plumbing', 'Water', 'Cleaning', 'Room', 'Furniture', 'Mess/Food', 'Bathroom', 'Other')),
      description TEXT NOT NULL,
      photo_url TEXT,
      status TEXT DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
      admin_notes TEXT,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- System & Warden Configuration
    CREATE TABLE IF NOT EXISTS hostel_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Audit Logs (for tracking all sensitive administrative overrides & operations)
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      performed_by INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      original_data TEXT,
      new_data TEXT,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe migrations for table extensions
  try { db.exec("ALTER TABLE outpasses ADD COLUMN student_contact TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leave_applications ADD COLUMN student_contact TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leave_applications ADD COLUMN departure_route TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leave_applications ADD COLUMN return_route TEXT"); } catch (e) {}

  // Anti-Proxy & Device Binding Migrations
  try { db.exec("ALTER TABLE students ADD COLUMN registered_device_id TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE students ADD COLUMN registered_device_name TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE students ADD COLUMN device_registered_at DATETIME"); } catch (e) {}
  try { db.exec("ALTER TABLE movement_records ADD COLUMN device_id TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE movement_records ADD COLUMN device_name TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE movement_records ADD COLUMN is_proxy_blocked INTEGER DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE movement_sessions ADD COLUMN token_interval_seconds INTEGER DEFAULT 3"); } catch (e) {}
}

initDatabase();

module.exports = {
  db,
  initDatabase
};
