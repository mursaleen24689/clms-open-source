import { date, datetime, int, longtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Staff accounts. Roles: employee, hod, pa, clerk, admin.
 * Passwords are stored as bcrypt hashes.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: varchar("employeeId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: text("name").notNull(),
  email: varchar("email", { length: 320 }),
  designation: text("designation"),
  department: text("department"),
  role: mysqlEnum("role", ["employee", "hod", "pa", "clerk", "admin"]).notNull().default("employee"),
  isActive: int("isActive").notNull().default(1),
  persNo: varchar("persNo", { length: 50 }),
  bps: varchar("bps", { length: 20 }),
  phone: varchar("phone", { length: 255 }),
  profile_pic: longtext("profile_pic"),
  supervisor_id: int("supervisor_id"),
  is_supervisor: int("is_supervisor").notNull().default(0),
  requiresPasswordChange: int("requiresPasswordChange").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Leave applications. Status values are free text; the application uses
 * pending, pending_supervisor, approved, rejected and without_pay.
 */
export const leaveApplications = mysqlTable("leaveapplications", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  numberOfDays: int("numberOfDays").notNull(),
  leaveType: varchar("leaveType", { length: 50 }).notNull().default("CL"),
  reason: text("reason"),
  status: varchar("status", { length: 50 }).default("pending_supervisor"),
  remarks: text("remarks"),
  approvedBy: int("approvedBy"),
  approvalDate: timestamp("approvalDate"),
  isCompensated: int("isCompensated").default(0),
  supervisor_approved_by: varchar("supervisor_approved_by", { length: 255 }),
  supervisor_approved_at: datetime("supervisor_approved_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeaveApplication = typeof leaveApplications.$inferSelect;
export type InsertLeaveApplication = typeof leaveApplications.$inferInsert;

/**
 * Per-year leave balance for each staff account.
 */
export const leaveBalances = mysqlTable("leavebalances", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().unique(),
  leaveType: varchar("leaveType", { length: 50 }).notNull().default("CL"),
  totalAllocated: int("totalAllocated").notNull().default(12),
  used: int("used").notNull().default(0),
  withoutPay: int("withoutPay").notNull().default(0),
  remaining: int("remaining").notNull().default(12),
  year: int("year").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type InsertLeaveBalance = typeof leaveBalances.$inferInsert;

/**
 * Public holidays excluded from working-day calculations.
 */
export const publicHolidays = mysqlTable("public_holidays", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  date: date("date").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Internal memos written in the memo module.
 */
export const memos = mysqlTable("memos", {
  id: int("id").autoincrement().primaryKey(),
  created_by_username: varchar("created_by_username", { length: 100 }).notNull(),
  memo_ref: varchar("memo_ref", { length: 50 }),
  to_field: text("to_field").notNull(),
  subject: text("subject").notNull(),
  urgency: varchar("urgency", { length: 20 }).default("ROUTINE"),
  from_name: varchar("from_name", { length: 255 }),
  from_designation: varchar("from_designation", { length: 255 }),
  pers_no: varchar("pers_no", { length: 50 }),
  main_matter: longtext("main_matter"),
  copy_to: text("copy_to"),
  enclosed_items: text("enclosed_items"),
  memo_date: date("memo_date"),
  created_at: datetime("created_at"),
});

/**
 * Administrative audit trail.
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  user_name: varchar("user_name", { length: 100 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  target: varchar("target", { length: 100 }).notNull(),
  ip_address: varchar("ip_address", { length: 255 }).notNull(),
  timestamp: datetime("timestamp"),
});

/**
 * Bcrypt hashes of the last passwords used by each account.
 */
export const passwordHistory = mysqlTable("password_history", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 255 }),
  password: varchar("password", { length: 255 }),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Support tickets submitted from the dashboards.
 */
export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 255 }),
  subject: varchar("subject", { length: 255 }),
  message: text("message"),
  attachment_path: varchar("attachment_path", { length: 255 }),
  attachment_name: varchar("attachment_name", { length: 255 }),
  status: varchar("status", { length: 50 }).default("pending"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Profile change requests waiting for administrator approval.
 */
export const profileRequests = mysqlTable("profile_requests", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 255 }),
  name: varchar("name", { length: 255 }),
  designation: varchar("designation", { length: 255 }),
  bps: varchar("bps", { length: 255 }),
  persNo: varchar("persNo", { length: 255 }),
  phone: varchar("phone", { length: 255 }),
  email: varchar("email", { length: 255 }),
  profile_pic: longtext("profile_pic"),
  status: varchar("status", { length: 50 }).default("pending"),
  admin_remarks: text("admin_remarks"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});
