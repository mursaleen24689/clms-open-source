import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, leaveApplications, leaveBalances } from "../drizzle/schema";
import { ENV } from './_core/env';
import bcrypt from "bcryptjs";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Get user by username and password (for local authentication)
 */
export async function getUserByCredentials(username: string, password: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (result.length === 0) return undefined;

  const user = result[0];
  const isHashedPassword = /^\$2[aby]\$/.test(user.password);
  const validPassword = isHashedPassword
    ? await bcrypt.compare(password, user.password).catch(() => false)
    : user.password === password;
  if (!validPassword) return undefined;

  return user;
}

/**
 * Get user by ID
 */
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Create or update user
 */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.username) {
    throw new Error("User username is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    await db.insert(users).values(user).onDuplicateKeyUpdate({
      set: {
        name: user.name,
        email: user.email,
        designation: user.designation,
        department: user.department,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

/**
 * Get all employees
 */
export async function getAllEmployees() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(users)
    .where(eq(users.role, "employee"));
}

/**
 * Get leave applications by employee
 */
export async function getLeaveApplicationsByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(leaveApplications)
    .where(eq(leaveApplications.employeeId, employeeId));
}

/**
 * Get all pending leave applications (for HOD)
 */
export async function getPendingLeaveApplications() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(leaveApplications)
    .where(eq(leaveApplications.status, "pending"));
}

/**
 * Authenticate user (for local authentication & tests)
 */
export async function authenticateUser(username: string, password: string) {
  return getUserByCredentials(username, password);
}

/**
 * Create a new user (for tests and seeds)
 */
export async function createUser(user: InsertUser): Promise<typeof users.$inferSelect> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values(user).onDuplicateKeyUpdate({
    set: {
      name: user.name,
      password: user.password,
      email: user.email,
      designation: user.designation,
      department: user.department,
      role: user.role,
    },
  });
  const byEmp = await db.select().from(users).where(eq(users.employeeId, user.employeeId)).limit(1);
  return byEmp[0];
}

/**
 * Get leave balance for employee
 */
export async function getLeaveBalance(employeeId: number, year: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.year, year)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Create leave balance
 */
export async function createLeaveBalance(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(leaveBalances).values(data).onDuplicateKeyUpdate({
    set: {
      totalAllocated: data.totalAllocated,
      remaining: data.remaining,
      used: data.used,
      withoutPay: data.withoutPay,
    },
  });
  const byEmp = await db
    .select()
    .from(leaveBalances)
    .where(and(eq(leaveBalances.employeeId, data.employeeId), eq(leaveBalances.year, data.year)))
    .limit(1);
  return byEmp[0];
}

/**
 * Update leave balance
 */
export async function updateLeaveBalance(employeeId: number, year: number, daysUsed: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const current = await getLeaveBalance(employeeId, year);
  if (!current) throw new Error("Balance record not found");

  const newUsed = current.used + daysUsed;
  const newRemaining = current.totalAllocated - newUsed;

  await db
    .update(leaveBalances)
    .set({ used: newUsed, remaining: newRemaining })
    .where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.year, year)));

  return { ...current, used: newUsed, remaining: newRemaining };
}

/**
 * Create leave application
 */
export async function createLeaveApplication(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result: any = await db.insert(leaveApplications).values(data);
  const insertId = result[0]?.insertId || result.insertId;
  if (insertId) {
    const inserted = await db.select().from(leaveApplications).where(eq(leaveApplications.id, insertId)).limit(1);
    if (inserted.length > 0) return inserted[0];
  }
  return { id: insertId, ...data };
}

/**
 * Update leave application status
 */
export async function updateLeaveApplicationStatus(
  applicationId: number,
  status: "pending" | "approved" | "rejected" | "without_pay",
  approvedBy: number,
  remarks?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {
    status,
    approvedBy,
    approvalDate: new Date(),
  };

  if (remarks) {
    updateData.remarks = remarks;
  }

  await db
    .update(leaveApplications)
    .set(updateData)
    .where(eq(leaveApplications.id, applicationId));

  const updated = await db.select().from(leaveApplications).where(eq(leaveApplications.id, applicationId)).limit(1);
  return updated[0];
}
