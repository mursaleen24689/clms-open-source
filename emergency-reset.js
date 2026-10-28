import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const parsedUrl = new URL(databaseUrl);
const dbConfig = {
  host: parsedUrl.hostname,
  user: decodeURIComponent(parsedUrl.username || "root"),
  password: decodeURIComponent(parsedUrl.password || ""),
  database: parsedUrl.pathname.replace(/^\//, ""),
  port: Number(parsedUrl.port) || 3306,
};

async function resetPassword() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("❌ Usage: npm run emergency-reset <username> <new_password>");
    console.error("Example: npm run emergency-reset admin SecurePass123!");
    process.exit(1);
  }

  const [username, newPassword] = args;

  if (newPassword.length < 12) {
    console.error("❌ Error: New password must be at least 12 characters long.");
    process.exit(1);
  }

  let connection;
  try {
    console.log(`🔌 Connecting to database '${dbConfig.database}' at ${dbConfig.host}...`);
    connection = await mysql.createConnection(dbConfig);

    // Check if user exists
    const [users] = await connection.execute(
      "SELECT id, name, role FROM users WHERE username = ?",
      [username]
    );

    if (users.length === 0) {
      console.error(`❌ Error: User '${username}' not found in the database.`);
      process.exit(1);
    }

    const user = users[0];
    console.log(`👤 Found User: ${user.name} (Role: ${user.role})`);

    // Hash the new password
    console.log(`🔐 Hashing new password...`);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the database
    console.log(`💾 Updating database...`);
    await connection.execute(
      "UPDATE users SET password = ?, requiresPasswordChange = 1 WHERE id = ?",
      [hashedPassword, user.id]
    );

    // Log the override in password_history
    await connection.execute(
      "INSERT INTO password_history (username, password) VALUES (?, ?)",
      [username, hashedPassword]
    );

    // Log to audit logs
    await connection.execute(
      "INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)",
      ["SYSTEM_ADMIN", "EMERGENCY_CLI_RESET", `User @${username}`, "localhost"]
    );

    console.log(`✅ SUCCESS: Password for '${username}' has been successfully reset!`);
    console.log(`👉 You can now log in using the new password.`);

  } catch (error) {
    console.error("❌ FATAL ERROR:", error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  }
}

resetPassword();
