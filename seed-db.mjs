import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const parsedUrl = new URL(databaseUrl);
const config = {
  host: parsedUrl.hostname,
  user: decodeURIComponent(parsedUrl.username || 'root'),
  password: decodeURIComponent(parsedUrl.password || ''),
  database: parsedUrl.pathname.replace(/^\//, ''),
  port: Number(parsedUrl.port) || 3306,
};
const seedPassword = process.env.SEED_DEFAULT_PASSWORD;
if (!seedPassword || seedPassword.length < 12) {
  throw new Error('Set SEED_DEFAULT_PASSWORD to a unique password of at least 12 characters.');
}

// Example accounts only. Replace this list with your own staff before real use.
const EXAMPLE_DEPARTMENT = 'Engineering';
const staff = [
  ['Dr. Jane Doe', 'Head of Department', 'hod', 'HOD001', 'hod'],
  ['Mr. John Smith', 'Personal Assistant', 'pa', 'PA001', 'pa'],
  ['System Administrator', 'System Administrator', 'admin', 'ADM001', 'admin'],
  ['Dr. Alice Johnson', 'Associate Professor', 'employee', 'EMP001', 'alice'],
  ['Dr. Robert Martin', 'Assistant Professor', 'employee', 'EMP002', 'robert'],
  ['Dr. Carol Diaz', 'Assistant Professor', 'employee', 'EMP003', 'carol'],
  ['Mr. David Lee', 'Lecturer', 'employee', 'EMP004', 'david'],
  ['Ms. Emma Brown', 'Lecturer', 'employee', 'EMP005', 'emma'],
  ['Mr. Frank Miller', 'Administrative Officer', 'clerk', 'CLK001', 'frank'],
  ['Ms. Grace Kim', 'Lab Technician', 'employee', 'EMP006', 'grace'],
];

async function seedDatabase() {
  const connection = await mysql.createConnection(config);

  try {
    console.log('Starting example database seed...');

    // Upsert the example accounts without deleting existing user or leave data.
    const hashedSeedPassword = await bcrypt.hash(seedPassword, 12);

    for (const [name, designation, role, empId, username] of staff) {
      await connection.execute(
        `INSERT INTO users (employeeId, username, password, name, designation, department, role, requiresPasswordChange)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE name=VALUES(name), designation=VALUES(designation), department=VALUES(department), role=VALUES(role)`,
        [empId, username, hashedSeedPassword, name, designation, EXAMPLE_DEPARTMENT, role]
      );

      const [userRows] = await connection.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (!userRows.length) throw new Error(`Failed to create or find user ${username}.`);

      // Create the standard yearly balance only when this account has no balance yet.
      await connection.execute(
        `INSERT INTO leavebalances (employeeId, remaining, used)
         VALUES (?, 25, 0) ON DUPLICATE KEY UPDATE employeeId = VALUES(employeeId)`,
        [userRows[0].id]
      );
    }

    console.log(`Example accounts synchronized: ${staff.length}. Existing users and leave records were preserved.`);
    console.log('Every seeded account must change its password at first sign-in.');

    await connection.end();
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seedDatabase();
