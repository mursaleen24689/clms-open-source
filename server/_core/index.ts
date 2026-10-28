import "dotenv/config";
import express from "express";
import { randomBytes } from "node:crypto";
import { createServer } from "http";
import net from "net";
import mysql from "mysql2/promise";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs"; 
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

// 1. Database Connection Configuration (Reads from DATABASE_URL if provided, with XAMPP defaults)
const parseDbUrl = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be configured before starting the server.");
  try {
    const parsed = new URL(url);
    if (!['mysql:', 'mysql2:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.replace(/^\//, '')) {
      throw new Error("DATABASE_URL must include a MySQL host and database name.");
    }
    return {
      host: parsed.hostname || "localhost",
      user: decodeURIComponent(parsed.username || "root"),
      password: decodeURIComponent(parsed.password || ""),
      database: (parsed.pathname || "/leave_management").replace(/^\//, ""),
      port: Number(parsed.port) || 3306,
    };
  } catch (error) {
    throw new Error(`DATABASE_URL is invalid: ${error instanceof Error ? error.message : "unknown error"}`);
  }
};

const dbConfig = parseDbUrl();

// --- OPTIONAL IP WHITELISTING ---
// Set ALLOWED_IP_PREFIXES in .env to restrict access, for example "192.168.1.,10.0.0.".
// Leave it empty to accept connections from any address on the network.
const allowedIpPrefixes = (process.env.ALLOWED_IP_PREFIXES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const IP_WHITELIST_ENABLED = allowedIpPrefixes.length > 0;
const allowedSubnets = [...allowedIpPrefixes, "127.0.0.1", "::1"];

const getClientIp = (req: express.Request) => {
  // Only trust X-Forwarded-For if Express trust proxy is enabled
  let ip = (req.app.get('trust proxy') && typeof req.headers['x-forwarded-for'] === 'string')
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress;
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip?.trim() || 'Unknown IP';
};

const isAllowedIp = (ip: string) => {
  if (!IP_WHITELIST_ENABLED) return true;
  return allowedSubnets.some(subnet => ip.startsWith(subnet) || ip === subnet);
};

const configuredJwtSecret = process.env.JWT_SECRET;
if (!configuredJwtSecret || configuredJwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters.");
}
const JWT_SECRET: string = configuredJwtSecret;
let authDbPool: mysql.Pool | undefined;
const isIsoCalendarDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// SECURITY FIX: Simple, memory-efficient login rate limiter
const loginAttemptsTracker = new Map<string, { count: number; lockUntil: number; lastAttempt: number }>();
const loginRateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const tracking = loginAttemptsTracker.get(ip);

  if (tracking && tracking.lockUntil > now) {
    const waitSeconds = Math.ceil((tracking.lockUntil - now) / 1000);
    return res.status(429).json({ 
      error: `🛡️ Brute Force Guard: Too many failed login attempts. Please wait ${waitSeconds} seconds.` 
    });
  }
  if (tracking && ((tracking.lockUntil > 0 && tracking.lockUntil <= now) || now - tracking.lastAttempt > 30 * 60 * 1000)) {
    loginAttemptsTracker.delete(ip);
  }
  next();
};

// SECURITY: server-verified login captcha.
//
// The code is generated and kept here; the browser only receives a picture, so
// a script cannot read the answer out of the page the way a JavaScript-only
// check could be bypassed. Six characters, single use, valid for five minutes.
const captchaChallenges = new Map<string, { answer: string; expires: number }>();

// 5x7 pixel font — the letters are drawn as square blocks, so the answer never
// appears as readable text inside the image payload.
const CAPTCHA_FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

function drawCaptchaGlyph(char: string, left: number, top: number, cell: number): string {
  const rows = CAPTCHA_FONT[char];
  if (!rows) return "";
  let out = "";
  for (let r = 0; r < rows.length; r++) {
    let runStart = -1;
    for (let c = 0; c <= rows[r].length; c++) {
      const filled = c < rows[r].length && rows[r][c] === "1";
      if (filled && runStart < 0) runStart = c;
      if (!filled && runStart >= 0) {
        out += `<rect x="${left + runStart * cell}" y="${top + r * cell}" width="${(c - runStart) * cell}" height="${cell}"/>`;
        runStart = -1;
      }
    }
  }
  return out;
}

function buildCaptcha() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let answer = "";
  for (let i = 0; i < 6; i++) answer += chars[Math.floor(Math.random() * chars.length)];

  const now = Date.now();
  captchaChallenges.forEach((v, k) => { if (v.expires < now) captchaChallenges.delete(k); });
  const id = randomBytes(16).toString("hex");
  captchaChallenges.set(id, { answer, expires: now + 5 * 60 * 1000 });

  const cell = 4;
  let glyphs = "";
  for (let i = 0; i < answer.length; i++) {
    const x = 22 + i * 31;
    const y = 18 + (Math.random() * 8 - 4);
    const rotation = (Math.random() * 20 - 10).toFixed(1);
    glyphs += `<g fill="hsl(${200 + Math.floor(Math.random() * 40)}, 35%, ${22 + Math.floor(Math.random() * 12)}%)"`
      + ` transform="rotate(${rotation} ${x + 10} ${y + 14})">`
      + drawCaptchaGlyph(answer[i], x, Math.round(y), cell)
      + `</g>`;
  }
  let noise = "";
  for (let i = 0; i < 7; i++) {
    noise += `<line x1="${(Math.random() * 220).toFixed(0)}" y1="${(Math.random() * 68).toFixed(0)}" x2="${(Math.random() * 220).toFixed(0)}" y2="${(Math.random() * 68).toFixed(0)}" stroke="rgba(15,23,42,0.16)" stroke-width="1"/>`;
  }
  for (let i = 0; i < 24; i++) {
    noise += `<circle cx="${(Math.random() * 220).toFixed(0)}" cy="${(Math.random() * 68).toFixed(0)}" r="1.3" fill="rgba(15,23,42,0.14)"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="68" viewBox="0 0 220 68">`
    + `<rect width="220" height="68" fill="#f1f5f9"/>${noise}${glyphs}</svg>`;

  return {
    success: true,
    captcha_id: id,
    image: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
  };
}

function verifyCaptcha(captchaId: unknown, captchaAnswer: unknown): { ok: boolean; message?: string } {
  const id = typeof captchaId === "string" ? captchaId : "";
  const answer = typeof captchaAnswer === "string" ? captchaAnswer.trim().toUpperCase() : "";
  const challenge = id ? captchaChallenges.get(id) : undefined;
  if (!challenge) return { ok: false, message: "Security code is missing or expired. Please enter the new code." };
  captchaChallenges.delete(id);
  if (challenge.expires < Date.now()) return { ok: false, message: "Security code has expired. Please enter the new code." };
  if (challenge.answer !== answer) return { ok: false, message: "Security code is incorrect. Please enter the new code." };
  return { ok: true };
}

// Security Middleware to verify digital passports
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: "Access Denied: Missing Security Token" });
  }
  
  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Access Denied: Invalid or Expired Token" });
    }
    try {
      const tokenUser = user as jwt.JwtPayload;
      if (!tokenUser?.id || !authDbPool) return res.status(403).json({ error: "Access Denied: Invalid session" });
      const [rows]: any = await authDbPool.execute("SELECT id, username, name, role FROM users WHERE id = ? AND username = ?", [tokenUser.id, tokenUser.username]);
      if (!rows.length) return res.status(403).json({ error: "Access Denied: Account no longer exists" });
      (req as any).user = { ...tokenUser, id: rows[0].id, username: rows[0].username, name: rows[0].name, role: rows[0].role };
      next();
    } catch {
      res.status(500).json({ error: "Unable to validate session." });
    }
  });
};

// SECURITY FIX: Middleware to verify role clearances securely using JWT
const requireRole = (allowedRoles: string[]) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user;
    if (!user || !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: `🛡️ Access Denied. Required clearance: ${allowedRoles.join(', ')}` });
    }
    next();
  };
};

// --- AUTOMATED DATABASE BACKUP ENGINE ---
const backupDatabase = () => {
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const fileName = `leave_management_backup_${date}_${time}.sql`;
  const filePath = path.join(backupDir, fileName);

  // Set MYSQLDUMP_PATH when mysqldump is not on PATH (for example the XAMPP copy).
  const mysqldumpPath = process.env.MYSQLDUMP_PATH || "mysqldump";
  const args = ["--host", dbConfig.host, "--port", String(dbConfig.port), "--user", dbConfig.user, dbConfig.database];
  const output = fs.createWriteStream(filePath, { mode: 0o600 });
  const dump = spawn(mysqldumpPath, args, {
    shell: false,
    windowsHide: true,
    env: { ...process.env, MYSQL_PWD: dbConfig.password },
  });
  dump.stdout.pipe(output);
  dump.stderr.on("data", data => console.warn(`[BACKUP] ${String(data).trim()}`));
  dump.on("error", error => {
    output.destroy();
    fs.rm(filePath, { force: true }, () => {});
    console.warn(`[BACKUP] Automated backup skipped/failed: ${error.message}`);
  });
  dump.on("close", code => {
    if (code !== 0) {
      output.destroy();
      fs.rm(filePath, { force: true }, () => {});
      console.warn(`[BACKUP] mysqldump exited with code ${code}`);
    } else {
      output.end();
      console.log(`[SUCCESS] Database backed up to: ${filePath}`);
    }
  });
};

const triggerBackupIfInHours = () => {
  const now = new Date();
  const timeInMinutes = now.getHours() * 60 + now.getMinutes();
  // Only trigger backups between 8:30 AM and 4:30 PM
  if (timeInMinutes >= (8 * 60 + 30) && timeInMinutes <= (16 * 60 + 30)) {
    backupDatabase();
  }
};

const schedulePeriodicBackup = () => {
  console.log("🛡️ Automated Backup Engine Initialized");
  triggerBackupIfInHours(); // Run once on startup
  setInterval(triggerBackupIfInHours, 30 * 60 * 1000); // Check every 30 mins
};

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // SECURITY FIX: Robust Connection Pool
  const db = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  authDbPool = db;

  // Ensure necessary folders exist for File Uploads
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

  // Support attachments are only served through an authenticated admin route.
  app.get('/api/admin/support/:id/attachment', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      const [rows]: any = await db.execute("SELECT attachment_path, attachment_name FROM support_tickets WHERE id = ?", [req.params.id]);
      if (!rows.length || !rows[0].attachment_path) return res.status(404).json({ error: "Attachment not found." });
      const filename = path.basename(String(rows[0].attachment_path));
      const filePath = path.join(uploadsDir, filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Attachment file is missing." });
      res.download(filePath, path.basename(String(rows[0].attachment_name || filename)));
    } catch { res.status(500).json({ error: "Failed to retrieve attachment." }); }
  });

  // --- ENSURE ALL AUDIT & SUPPORT TABLES EXIST ---
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY, 
      user_name VARCHAR(255), 
      action VARCHAR(255), 
      target VARCHAR(255), 
      ip_address VARCHAR(255), 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS password_history (
      id INT AUTO_INCREMENT PRIMARY KEY, 
      username VARCHAR(255), 
      password VARCHAR(255), 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255),
      subject VARCHAR(255),
      message TEXT,
      attachment_path VARCHAR(255),
      attachment_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS profile_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255),
      name VARCHAR(255),
      designation VARCHAR(255),
      bps VARCHAR(255),
      persNo VARCHAR(255),
      phone VARCHAR(255),
      email VARCHAR(255),
      profile_pic LONGTEXT,
      status VARCHAR(50) DEFAULT 'pending',
      admin_remarks TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Safely inject new columns into the tables if they don't already exist (Auto-Migrations)
  try { await db.execute("ALTER TABLE users ADD COLUMN phone VARCHAR(255)"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN email VARCHAR(255)"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN profile_pic LONGTEXT"); } catch(e) {}
  try { await db.execute("ALTER TABLE profile_requests ADD COLUMN admin_remarks TEXT"); } catch(e) {}
  
  // Multi-Level Approvals Auto-Migration (Ignores duplicates if they already exist)
  try { await db.execute("ALTER TABLE users ADD COLUMN supervisor_id INT NULL"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN is_supervisor TINYINT(1) NOT NULL DEFAULT 0"); } catch(e) {}
  try { await db.execute(`
    CREATE TABLE IF NOT EXISTS memos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      created_by_username VARCHAR(100) NOT NULL,
      memo_ref VARCHAR(50) NULL,
      to_field TEXT NOT NULL,
      subject TEXT NOT NULL,
      urgency VARCHAR(20) DEFAULT 'ROUTINE',
      from_name VARCHAR(255),
      from_designation VARCHAR(255),
      pers_no VARCHAR(50),
      main_matter LONGTEXT,
      copy_to TEXT,
      enclosed_items TEXT,
      memo_date DATE,
      created_at DATETIME DEFAULT NOW(),
      INDEX idx_username (created_by_username),
      INDEX idx_date (memo_date)
    )
  `); } catch(e) {}
  try { await db.execute("ALTER TABLE leaveapplications ADD COLUMN supervisor_approved_by VARCHAR(255) NULL"); } catch(e) {}
  try { await db.execute("ALTER TABLE leaveapplications ADD COLUMN supervisor_approved_at DATETIME NULL"); } catch(e) {}

  // Start the automated backup process
  schedulePeriodicBackup();

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // SECURITY: server-verified login captcha challenge
  app.get("/api/captcha", (_req, res) => {
    res.json(buildCaptcha());
  });
  
  // IP Whitelisting Middleware
  app.use((req, res, next) => {
    const ip = getClientIp(req);
    if (req.path.startsWith('/api/') && !isAllowedIp(ip)) {
      console.log(`[SECURITY] Blocked Access from Unauthorized IP: ${ip}`);
      return res.status(403).json({ 
        error: `Access blocked: this server only accepts connections from configured networks. (IP: ${ip})` 
      });
    }
    next();
  });

  registerOAuthRoutes(app);

  // --- REST API ENDPOINTS ---

  // 1. Secure Login Endpoint (SECURITY FIX: Implemented Bcrypt with Silent Upgrade and Rate Limiting)
  app.post("/api/login", loginRateLimiter, async (req, res) => {
    const { username, password, captcha_id, captcha_answer } = req.body;
    const captcha = verifyCaptcha(captcha_id, captcha_answer);
    if (!captcha.ok) {
      return res.status(400).json({ error: captcha.message, captcha_required: true });
    }
    const ipAddress = getClientIp(req);
    try {
      const [rows]: any = await db.execute(
        "SELECT id, name, role, persNo, bps, requiresPasswordChange, password FROM users WHERE username = ?", 
        [username]
      );
      
      if (rows.length > 0) {
        const user = rows[0];
        let isMatch = false;
        const isPlaintextMatch = (password === user.password); // Fallback for old legacy accounts
        
        if (isPlaintextMatch) {
            isMatch = true;
            // Silent Security Upgrade: Hash plain-text password instantly so it's safe forever
            const hashedUpgrade = await bcrypt.hash(password, 10);
            await db.execute("UPDATE users SET password = ? WHERE id = ?", [hashedUpgrade, user.id]);
            
            // Also hash and store in history securely
            await db.execute("INSERT INTO password_history (username, password) VALUES (?, ?)", [username, hashedUpgrade]);
        } else {
            isMatch = await bcrypt.compare(password, user.password).catch(() => false);
        }
        
        if (isMatch) {
            // Success: clear rate limiting tracking for this IP
            loginAttemptsTracker.delete(ipAddress);

            await db.execute(
              "INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", 
              [user.name, 'LOGIN', 'System Access', ipAddress]
            );
            
            const token = jwt.sign({ id: user.id, role: user.role, username, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
            
            return res.json({ 
              success: true, 
              token, 
              name: user.name, 
              role: user.role, 
              persNo: user.persNo, 
              bps: user.bps, 
              requiresPasswordChange: user.requiresPasswordChange === 1 
            });
        }
      }

      // Failed login attempt tracking
      const tracking = loginAttemptsTracker.get(ipAddress) || { count: 0, lockUntil: 0, lastAttempt: Date.now() };
      tracking.count += 1;
      tracking.lastAttempt = Date.now();
      if (tracking.count >= 5) {
         tracking.lockUntil = Date.now() + 60 * 1000; // Lock for 60 seconds after 5 failed attempts
      }
      loginAttemptsTracker.set(ipAddress, tracking);
      if (loginAttemptsTracker.size > 10_000) {
        const cutoff = Date.now() - 30 * 60 * 1000;
        loginAttemptsTracker.forEach((attempt, trackedIp) => {
          if (attempt.lastAttempt < cutoff) loginAttemptsTracker.delete(trackedIp);
        });
      }

      res.status(401).json({ error: "Invalid username or password" });
    } catch (error) { 
      res.status(500).json({ error: "Server error" }); 
    }
  });

  // 2. Forgot Password Reset Endpoint (IT Approval Workflow)
  app.post("/api/forgot-password", async (req, res) => {
    const { username, persNo } = req.body;
    try {
      const [rows]: any = await db.execute(
        "SELECT id, name FROM users WHERE username = ? AND persNo = ?", 
        [username, persNo]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Verification failed." });

      const user = rows[0];
      const subject = "Password Reset Request";
      const message = `User @${username} (${user.name}) has requested a password reset. Please verify their identity and use the Admin Override to issue a temporary password.`;

      // Insert a support ticket for the IT Admin
      await db.execute(
        "INSERT INTO support_tickets (username, subject, message, status) VALUES (?, ?, ?, 'pending')", 
        [username, subject, message]
      );
      
      // Log the request
      await db.execute(
        "INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", 
        [user.name, 'PASSWORD_RESET_REQUEST', 'Support Desk', getClientIp(req)]
      );

      res.json({ message: "Request received successfully!" });
    } catch (error) { 
      res.status(500).json({ error: "Server error" }); 
    }
  });

  // 3. User Details
  app.get("/api/user-details", authenticateToken, async (req, res) => {
    const caller = (req as any).user;
    const requestedUsername = typeof req.query.username === 'string' ? req.query.username : caller?.username;
    
    // Authorization: User can only view their own profile unless they have management role
    const isManagement = ['hod', 'admin', 'clerk', 'pa'].includes(caller?.role);
    if (!isManagement && caller?.username !== requestedUsername) {
      return res.status(403).json({ error: "Access Denied: You can only view your own details." });
    }
    const username = requestedUsername || caller?.username;

    try {
      const [rows]: any = await db.execute(`
        SELECT u.name, u.role, u.designation, u.persNo, u.bps, u.phone, u.email, u.profile_pic as profilePic, b.remaining, u.supervisor_id 
        FROM users u 
        LEFT JOIN leavebalances b ON u.id = b.employeeId 
        WHERE u.username = ?
      `, [username]);
      
      if (rows.length > 0) {
        // Also fetch supervisor name for the freeze button label
        let supervisorName = null;
        if (rows[0].supervisor_id) {
          const [supRows]: any = await db.execute(
            "SELECT name, designation FROM users WHERE id = ?", [rows[0].supervisor_id]
          );
          if (supRows.length > 0) supervisorName = supRows[0].name;
        }
        res.json({ 
          name: rows[0].name, role: rows[0].role, designation: rows[0].designation,
          persNo: rows[0].persNo, bps: rows[0].bps, phone: rows[0].phone, email: rows[0].email,
          profilePic: rows[0].profilePic, balance: rows[0].remaining || 0,
          supervisor_id: rows[0].supervisor_id || null,
          supervisor_name: supervisorName
        });
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) { res.status(500).json({ error: "Database failed" }); }
  });

  // 4. Submit Leave Request with MULTI-LEVEL ROUTING Integration
  app.post("/api/submit-leave", authenticateToken, async (req, res) => {
    const caller = (req as any).user;
    const { startDate, endDate, numberOfDays, reason } = req.body; 

    // Regular users can only submit for themselves; management can submit on behalf of others
    let username = caller?.username;
    if (req.body.username && ['admin', 'hod', 'clerk'].includes(caller?.role)) {
      username = req.body.username;
    }

    const requestedDays = Number(numberOfDays);
    if (!isIsoCalendarDate(startDate) || (endDate != null && !isIsoCalendarDate(endDate)) || !Number.isInteger(requestedDays) || requestedDays < 0 || (endDate && endDate < startDate)) {
      return res.status(400).json({ error: "Invalid leave duration or dates." });
    }

    try {
      // Fetch user info, their role, and their linked supervisor_id
      const [users]: any = await db.execute("SELECT id, name, role, supervisor_id FROM users WHERE username = ?", [username]);
      if (users.length === 0) return res.status(404).json({ error: "User not found" });
      
      const employeeId = users[0].id;
      const supervisorId = users[0].supervisor_id;
      const userRoleDb = users[0].role;
      const leaveEndDate = endDate || startDate;
      const [holidayRows]: any = await db.execute("SELECT date FROM public_holidays WHERE date BETWEEN ? AND ?", [startDate, leaveEndDate]);
      const holidayDates = new Set(holidayRows.map((row: any) => {
        const value = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
        return value;
      }));
      let expectedDays = 0;
      for (let current = new Date(`${startDate}T00:00:00.000Z`), last = new Date(`${leaveEndDate}T00:00:00.000Z`); current <= last; current.setUTCDate(current.getUTCDate() + 1)) {
        const day = current.getUTCDay();
        const currentDate = current.toISOString().slice(0, 10);
        if (!(holidayDates.has(currentDate) && day !== 0 && day !== 6)) expectedDays++;
      }
      if (requestedDays !== expectedDays) return res.status(400).json({ error: `Requested days do not match the selected dates and holiday calendar (expected ${expectedDays}).` });

      const [existingLeaves]: any = await db.execute(
        `SELECT id FROM leaveapplications WHERE employeeId = ? AND status IN ('pending', 'pending_supervisor', 'approved') AND startDate <= ? AND IFNULL(endDate, DATE_ADD(startDate, INTERVAL (? - 1) DAY)) >= ?`,
        [employeeId, leaveEndDate, requestedDays, startDate]
      );

      if (existingLeaves.length > 0) return res.status(400).json({ error: "Duplicate Blocked: Overlapping dates." });

      // SMART ROUTING:
      // HOD/Admin → always go straight to 'pending' (no supervisor step, Dean signs physically)
      // Others with supervisor assigned → 'pending_supervisor' first
      // Others without supervisor → 'pending' (goes straight to HOD)
      const isHodOrAdmin = userRoleDb === 'hod'; // Only actual HOD bypasses supervisor step
      const initialStatus = isHodOrAdmin ? 'pending' : (supervisorId ? 'pending_supervisor' : 'pending');

      const [result]: any = await db.execute(
        `INSERT INTO leaveapplications (employeeId, startDate, endDate, numberOfDays, reason, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [employeeId, startDate, endDate || null, requestedDays, reason, initialStatus]
      );

      await db.execute("INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", [users[0].name, 'SUBMIT_LEAVE', `Leave ID #${result.insertId}`, getClientIp(req)]);
      res.json({ success: true, message: "Application sent" });
    } catch (error) { res.status(500).json({ error: "Failed to submit leave" }); }
  });

  // 5. Get Pending Leaves (Includes pending_supervisor records for the same portal)
  app.get("/api/admin/pending-leaves", authenticateToken, requireRole(['hod', 'admin', 'clerk', 'pa']), async (req, res) => {
    try {
      const [rows]: any = await db.execute(`
        SELECT la.id, u.name, la.startDate as date, la.endDate, la.reason, la.numberOfDays, la.status, u.supervisor_id 
        FROM leaveapplications la JOIN users u ON la.employeeId = u.id WHERE la.status IN ('pending', 'pending_supervisor')
      `);
      res.json(rows);
    } catch (error) { res.status(500).json({ error: "Failed to fetch" }); }
  });

  // 6. Action Leave (Approve/Reject/Recommend Supervisor Step)
  app.post("/api/admin/leave-action/:id", authenticateToken, async (req, res) => {
    const { status, remarks, isCompensated = false } = req.body; 
    const caller = (req as any).user;
    const actionBy = caller?.name || caller?.username || "Management";
    if (!['approved', 'rejected', 'recommend', 'rejected_by_supervisor'].includes(status)) {
      return res.status(400).json({ error: "Invalid leave action." });
    }
    if (typeof isCompensated !== 'boolean' || (isCompensated && status !== 'approved')) {
      return res.status(400).json({ error: "Invalid compensation action." });
    }
    try {
      const [currentLeaves]: any = await db.execute(
        "SELECT status, numberOfDays, employeeId, supervisor_approved_by FROM leaveapplications WHERE id = ?",
        [req.params.id]
      );
      if (currentLeaves.length === 0) {
        return res.status(404).json({ error: "Leave application not found." });
      }
      const prevStatus = currentLeaves[0].status;
      if (status === 'recommend' || status === 'rejected_by_supervisor') {
        if (prevStatus !== 'pending_supervisor') {
          return res.status(409).json({ error: "Only supervisor-pending leave can receive a supervisor action." });
        }
        const [employeeRows]: any = await db.execute("SELECT supervisor_id FROM users WHERE id = ?", [currentLeaves[0].employeeId]);
        if (!employeeRows.length || Number(employeeRows[0].supervisor_id) !== Number(caller.id)) {
          return res.status(403).json({ error: "You are not assigned as this employee's supervisor." });
        }
        const nextStatus = status === 'recommend' ? 'pending' : 'rejected';
        const [result]: any = await db.execute(
          "UPDATE leaveapplications SET status = ?, supervisor_approved_by = ?, supervisor_approved_at = NOW() WHERE id = ? AND status = 'pending_supervisor'",
          [nextStatus, actionBy, req.params.id]
        );
        if (result.affectedRows !== 1) return res.status(409).json({ error: "Leave status changed; refresh and try again." });
        await db.execute("INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", [actionBy, status === 'recommend' ? 'RECOMMEND_LEAVE' : 'REJECT_LEAVE_SUPERVISOR', `Leave #${req.params.id}`, getClientIp(req)]);
        return res.json({ success: true });
      }
      if (!['hod', 'admin'].includes(caller.role)) return res.status(403).json({ error: "Only HOD or Admin can make final leave decisions." });
      if (prevStatus !== 'pending') return res.status(409).json({ error: "Only pending leave can receive a final decision." });

      // Normal HOD Approve/Reject logic
      // FIX: If HOD approves/rejects a leave still in pending_supervisor, 
      // auto-stamp it as HOD Override so the ISO form shows who approved
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [lockedLeaves]: any = await connection.execute("SELECT status, numberOfDays, employeeId FROM leaveapplications WHERE id = ? FOR UPDATE", [req.params.id]);
        if (!lockedLeaves.length || lockedLeaves[0].status !== 'pending') {
          await connection.rollback();
          return res.status(409).json({ error: "Leave status changed; refresh and try again." });
        }
        if (status === 'approved' && !isCompensated) {
          const [balanceRows]: any = await connection.execute("SELECT remaining FROM leavebalances WHERE employeeId = ? FOR UPDATE", [lockedLeaves[0].employeeId]);
          const days = Number(lockedLeaves[0].numberOfDays);
          if (days === 0) {
            await connection.rollback();
            return res.status(400).json({ error: "Zero-day holiday requests must be approved as compensation time." });
          }
          const currentRemaining = balanceRows.length > 0 ? Number(balanceRows[0].remaining) : 0;
          if (currentRemaining < days) {
            await connection.rollback();
            return res.status(400).json({ error: `Cannot approve: Insufficient leave balance (Remaining: ${currentRemaining}, Requested: ${days}).` });
          }
          await connection.execute("UPDATE leavebalances SET used = used + ?, remaining = remaining - ? WHERE employeeId = ?", [days, days, lockedLeaves[0].employeeId]);
        }
        await connection.execute("UPDATE leaveapplications SET status = ?, remarks = ?, isCompensated = ? WHERE id = ? AND status = 'pending'", [status, remarks || null, isCompensated ? 1 : 0, req.params.id]);
        const actionName = isCompensated ? 'APPROVE_COMP_OFF' : (status === 'approved' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE');
        await connection.execute("INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", [actionBy, actionName, `Leave #${req.params.id}`, getClientIp(req)]);
        await connection.commit();
      } catch (transactionError) {
        await connection.rollback();
        throw transactionError;
      } finally {
        connection.release();
      }

      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Action failed" }); }
  });

  // 7. Update Password internally 
  app.post("/api/update-password", authenticateToken, async (req, res) => {
    try {
      const caller = (req as any).user;
      const targetUsername = caller?.role === 'admin' ? (req.body.username || caller.username) : caller?.username;

      // Ownership check: regular users can only change their own password
      if (caller.username !== targetUsername && caller.role !== 'admin') {
        return res.status(403).json({ error: "Access Denied: You can only update your own password." });
      }

      if (typeof req.body.newPass !== 'string' || req.body.newPass.length < 12) {
        return res.status(400).json({ error: "Password must be at least 12 characters long." });
      }

      const [history]: any = await db.execute("SELECT password FROM password_history WHERE username = ? ORDER BY created_at DESC LIMIT 5", [targetUsername]);
      
      for (const h of history) {
          const isHistoryMatch = await bcrypt.compare(req.body.newPass, h.password).catch(() => req.body.newPass === h.password);
          if (isHistoryMatch) return res.status(400).json({ error: "Audit Policy: Cannot reuse last 5 passwords." });
      }

      const hashedPassword = await bcrypt.hash(req.body.newPass, 10);
      await db.execute("UPDATE users SET password = ?, requiresPasswordChange = 0 WHERE username = ?", [hashedPassword, targetUsername]);
      
      await db.execute("INSERT INTO password_history (username, password) VALUES (?, ?)", [targetUsername, hashedPassword]);
      
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to update password" }); }
  });

  // 8. Get Employee's Leave History 
  app.get("/api/my-leaves", authenticateToken, async (req, res) => {
    try {
      const caller = (req as any).user;
      const requestedUsername = typeof req.query.username === 'string' ? req.query.username : caller?.username;
      const isManagement = ['hod', 'admin', 'clerk', 'pa'].includes(caller?.role);
      if (!isManagement && caller?.username !== requestedUsername) {
        return res.status(403).json({ error: "Access Denied: You can only view your own leaves." });
      }
      const username = requestedUsername || caller?.username;
      const [rows]: any = await db.execute(`
        SELECT la.id, la.startDate, la.endDate, la.numberOfDays, la.reason, la.status, la.remarks, la.createdAt, la.isCompensated 
        FROM leaveapplications la JOIN users u ON la.employeeId = u.id 
        WHERE u.username = ? ORDER BY la.createdAt DESC
      `, [username]);
      res.json(rows);
    } catch (error) { res.status(500).json({ error: "Failed to fetch history" }); }
  });

  // 9. Fetching Detailed Employees includes Supervisor ID
  app.get("/api/admin/employees-detailed", authenticateToken, requireRole(['hod', 'admin', 'clerk', 'pa']), async (req, res) => {
    try {
      const [employees]: any = await db.execute(`
        SELECT 
          u.id, u.name, u.username, u.role, u.designation, u.persNo, u.bps, 
          u.supervisor_id, u.is_supervisor,
          u.profile_pic as profilePic,
          s.name as supervisor_name,
          s.designation as supervisor_designation,
          b.remaining as balance_remaining,
          b.used as balance_used
        FROM users u
        LEFT JOIN users s ON u.supervisor_id = s.id
        LEFT JOIN leavebalances b ON u.id = b.employeeId
        ORDER BY u.designation, u.name
      `);
      
      if (employees.length === 0) return res.json([]);

      const [allLeaves]: any = await db.execute("SELECT * FROM leaveapplications ORDER BY createdAt DESC");

      const aggregatedResult = employees.map((emp: any) => {
         const leaves = allLeaves.filter((l: any) => l.employeeId === emp.id);
         return {
           ...emp,
           leaves,
            balance: { remaining: emp.balance_remaining ?? 25, used: emp.balance_used ?? 0 }
         };
      });

      res.json(aggregatedResult);
    } catch (error) {
      console.error("GET /api/admin/employees-detailed error:", error);
      res.status(500).json({ error: "Relational database aggregation query failed" });
    }
  });

  // 10. Get Employee Record 
  app.get("/api/admin/employee-records/:id", authenticateToken, requireRole(['hod', 'admin', 'clerk']), async (req, res) => {
    try {
      const [leaves]: any = await db.execute("SELECT * FROM leaveapplications WHERE employeeId = ? ORDER BY createdAt DESC", [req.params.id]);
      const [balance]: any = await db.execute("SELECT * FROM leavebalances WHERE employeeId = ?", [req.params.id]);
      res.json({ leaves, balance: balance.length > 0 ? balance[0] : { remaining: 25, used: 0 } });
    } catch (error) { res.status(500).json({ error: "Failed to fetch record" }); }
  });

  // 11. Yearly Quota Reset 
  app.post("/api/admin/reset-yearly-quota", authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      await db.execute("UPDATE leavebalances SET remaining = 25, used = 0");
      await db.execute("INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", [((req as any).user?.name || (req as any).user?.username), 'YEAR_END_RESET', 'All Balances', getClientIp(req)]);
      res.json({ success: true, message: "All employee balances reset to 25 days." });
    } catch (error) { res.status(500).json({ error: "Failed to reset quotas" }); }
  });

  // 12. Create User 
  app.post("/api/admin/users", authenticateToken, requireRole(['admin']), async (req, res) => {
    const { name, username, password, role, designation, persNo, bps, employeeId } = req.body;
    if (typeof name !== 'string' || !name.trim() || typeof username !== 'string' || !/^[A-Za-z0-9._-]{2,64}$/.test(username) ||
        typeof password !== 'string' || password.length < 12 || !['employee', 'hod', 'admin', 'clerk', 'pa'].includes(role)) {
      return res.status(400).json({ error: "Provide a valid name, username, role, and password of at least 12 characters." });
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      const connection = await db.getConnection();
      let insertId: number;
      try {
        await connection.beginTransaction();
        const [result]: any = await connection.execute(
          "INSERT INTO users (employeeId, name, username, password, role, designation, persNo, bps, requiresPasswordChange) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
          [
            typeof employeeId === 'string' && employeeId.trim() ? employeeId.trim() : username,
            name.trim(), username, hashedPassword, role, designation || null, persNo || null, bps || null,
          ]
        );
        insertId = result.insertId;
        await connection.execute("INSERT INTO leavebalances (employeeId, remaining, used) VALUES (?, 25, 0)", [insertId]);
        await connection.execute("INSERT INTO password_history (username, password) VALUES (?, ?)", [username, hashedPassword]);
        await connection.execute("INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", [((req as any).user?.name || (req as any).user?.username), 'CREATE_USER', username, getClientIp(req)]);
        await connection.commit();
      } catch (transactionError) {
        await connection.rollback();
        throw transactionError;
      } finally {
        connection.release();
      }
      
      res.json({ success: true, id: insertId });
    } catch (error: any) { res.status(500).json({ error: "Failed to create user" }); }
  });

  // 13. Update Balance Manually 
  app.put("/api/admin/users/:id/balance", authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      await db.execute("UPDATE leavebalances SET remaining = ? WHERE employeeId = ?", [req.body.balance, req.params.id]);
      await db.execute("INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", [((req as any).user?.name || (req as any).user?.username), 'UPDATE_BALANCE', `Emp #${req.params.id}`, getClientIp(req)]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to update balance" }); }
  });

  // 14. Delete User 
  app.delete("/api/admin/users/:id", authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      await db.execute("DELETE FROM leavebalances WHERE employeeId = ?", [req.params.id]);
      await db.execute("DELETE FROM leaveapplications WHERE employeeId = ?", [req.params.id]);
      await db.execute("DELETE FROM users WHERE id = ?", [req.params.id]);
      await db.execute("INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", [((req as any).user?.name || (req as any).user?.username), 'DELETE_USER', `Emp #${req.params.id}`, getClientIp(req)]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to delete user" }); }
  });

  // 15. Fetch Holidays 
  app.get("/api/admin/holidays", authenticateToken, async (req, res) => {
    try {
      const [rows] = await db.execute("SELECT * FROM public_holidays ORDER BY date ASC");
      res.json(rows);
    } catch (error) { res.status(500).json({ error: "Failed to fetch holidays" }); }
  });

  // 16. Add Holiday 
  app.post("/api/admin/holidays", authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      await db.execute("INSERT INTO public_holidays (name, date) VALUES (?, ?)", [req.body.name, req.body.date]);
      await db.execute("INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", [((req as any).user?.name || (req as any).user?.username), 'ADD_HOLIDAY', req.body.name, getClientIp(req)]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to add holiday" }); }
  });

  // 17. Delete Holiday 
  app.delete("/api/admin/holidays/:id", authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      await db.execute("DELETE FROM public_holidays WHERE id = ?", [req.params.id]);
      await db.execute("INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", [((req as any).user?.name || (req as any).user?.username), 'DELETE_HOLIDAY', `ID #${req.params.id}`, getClientIp(req)]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to delete holiday" }); }
  });

  // 18. Withdraw Pending Leave (Includes pending_supervisor state check)
  app.delete("/api/my-leaves/:id", authenticateToken, async (req, res) => {
    try {
      const caller = (req as any).user;
      const [leaveRows]: any = await db.execute(
        "SELECT la.status, la.employeeId, u.username FROM leaveapplications la JOIN users u ON la.employeeId = u.id WHERE la.id = ?",
        [req.params.id]
      );
      if (leaveRows.length === 0 || (leaveRows[0].status !== 'pending' && leaveRows[0].status !== 'pending_supervisor')) {
         return res.status(400).json({ error: "Only pending leaves can be withdrawn." });
      }
      if (leaveRows[0].username !== caller.username && !['admin', 'hod'].includes(caller.role)) {
         return res.status(403).json({ error: "Access Denied: You cannot withdraw someone else's leave." });
      }
      await db.execute("DELETE FROM leaveapplications WHERE id = ?", [req.params.id]);
      res.json({ success: true, message: "Leave withdrawn successfully." });
    } catch (error) { res.status(500).json({ error: "Failed to withdraw leave" }); }
  });

  // 19. Delegate Acting HOD 
  app.put("/api/admin/users/:id/delegate", authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      await db.execute("UPDATE users SET role = ? WHERE id = ?", [req.body.isDelegating ? 'hod' : 'employee', req.params.id]);
      res.json({ success: true, message: `User role upgraded/downgraded successfully` });
    } catch (error) { res.status(500).json({ error: "Failed to delegate authority" }); }
  });

  // 20. Submit Support Ticket
  app.post("/api/support", authenticateToken, async (req, res) => {
    const caller = (req as any).user;
    const username = caller?.username || req.body.username;
    const { subject, message, fileName, fileBase64 } = req.body;
    try {
      let fileUrl = null;
      if (fileBase64 && fileName) {
        if (typeof fileBase64 !== 'string' || fileBase64.length > 7_000_000) {
          return res.status(413).json({ error: "Attachments must be smaller than 5 MB." });
        }
        const ext = path.extname(fileName).toLowerCase();
        const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'];
        if (!allowedExtensions.includes(ext)) {
          return res.status(400).json({ error: "Invalid file type. Allowed formats: PDF, PNG, JPG, JPEG, DOC, DOCX." });
        }
        const cleanBase = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
        const cleanFileName = `${Date.now()}_${cleanBase}${ext}`;
        const filePath = path.join(process.cwd(), 'uploads', cleanFileName);
        const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, '');
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64Data)) {
          return res.status(400).json({ error: "Invalid attachment encoding." });
        }
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        fileUrl = `/uploads/${cleanFileName}`;
      }
      await db.execute("INSERT INTO support_tickets (username, subject, message, attachment_path, attachment_name) VALUES (?, ?, ?, ?, ?)", [username, subject, message, fileUrl, fileName || null]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to submit ticket." }); }
  });

  // 21. Fetch Help Desk Tickets (Admin)
  app.get("/api/admin/support", authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      const [rows] = await db.execute("SELECT * FROM support_tickets ORDER BY created_at DESC");
      res.json(rows);
    } catch (error) { res.status(500).json({ error: "Failed to fetch tickets" }); }
  });

  // 22. Resolve Help Desk Ticket (Admin)
  app.put("/api/admin/support/:id/resolve", authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      await db.execute("UPDATE support_tickets SET status = 'resolved' WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to resolve ticket" }); }
  });

  // 23. Submit Profile Update Request
  app.post("/api/profile-update", authenticateToken, async (req, res) => {
    const caller = (req as any).user;
    const { name, designation, persNo, bps, phone, email, profilePicBase64 } = req.body;
    const username = caller.username;
    if (profilePicBase64 && (typeof profilePicBase64 !== 'string' || profilePicBase64.length > 7_000_000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profilePicBase64))) {
      return res.status(400).json({ error: "Profile image must be a valid PNG, JPEG, or WebP under 5 MB." });
    }
    try {
      await db.execute(
        `INSERT INTO profile_requests (username, name, designation, bps, persNo, phone, email, profile_pic) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
        [username, name, designation, bps, persNo, phone, email, profilePicBase64]
      );
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to submit profile request" }); }
  });

  // 24. Fetch Pending Profile Requests (Admin)
  app.get("/api/admin/profile-requests", authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      const [rows] = await db.execute("SELECT * FROM profile_requests ORDER BY created_at DESC");
      res.json(rows);
    } catch (error) { res.status(500).json({ error: "Failed to fetch profile requests" }); }
  });

  // 25. Approve or Reject Profile Request (Admin)
  app.put("/api/admin/profile-requests/:id/:action", authenticateToken, requireRole(['admin']), async (req, res) => {
    const { id, action } = req.params;
    const { rejectReason } = req.body; 
    try {
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: "Invalid profile request action." });
      const status = action === 'approve' ? 'approved' : 'rejected';
      await db.execute("UPDATE profile_requests SET status = ?, admin_remarks = ? WHERE id = ?", [status, rejectReason || null, id]);
      
      if (action === 'approve') {
         const [reqs]: any = await db.execute("SELECT * FROM profile_requests WHERE id = ?", [id]);
         const r = reqs[0];
         if (r) {
            await db.execute(
              `UPDATE users SET name=?, designation=?, bps=?, persNo=?, phone=?, email=?, profile_pic=? WHERE username=?`,
              [r.name, r.designation, r.bps, r.persNo, r.phone, r.email, r.profile_pic, r.username]
            );
         }
      }
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Failed to process profile action" }); }
  });

  // 26. UPDATED NOTIFICATION ENGINE
  app.get("/api/notifications", authenticateToken, async (req, res) => {
    const userRole = (req as any).user.role;
    const username = (req as any).user.username;
    
    try {
      if (userRole === 'hod' || userRole === 'admin') {
        const [rows]: any = await db.execute("SELECT COUNT(*) as count FROM leaveapplications WHERE status = 'pending'");
        const [ticketRows]: any = await db.execute("SELECT COUNT(*) as count FROM support_tickets WHERE status = 'pending'");
        const [profileRows]: any = await db.execute("SELECT COUNT(*) as count FROM profile_requests WHERE status = 'pending'");
        
        const count = rows[0].count;
        const ticketCount = ticketRows[0].count;
        const profileCount = profileRows[0].count;
        
        let msgs = [];
        if (count > 0) msgs.push(`You have ${count} pending leave requests awaiting approval.`);
        if (ticketCount > 0 && userRole === 'admin') msgs.push(`You have ${ticketCount} pending Help Desk tickets to review!`);
        if (profileCount > 0 && userRole === 'admin') msgs.push(`You have ${profileCount} pending Profile Update requests to review!`);
        
        res.json({ count: count + (userRole === 'admin' ? ticketCount + profileCount : 0), messages: msgs });
        
      } else {
        const [users]: any = await db.execute("SELECT id FROM users WHERE username = ?", [username]);
        if (users.length === 0) return res.json({ count: 0, messages: [] });
        
        const [recentLeaves]: any = await db.execute("SELECT startDate, status FROM leaveapplications WHERE employeeId = ? AND status != 'pending' ORDER BY id DESC LIMIT 2", [users[0].id]);
        
        const messages = recentLeaves.map((l: any) => {
          const dateStr = l.startDate instanceof Date ? l.startDate.toISOString().split('T')[0] : String(l.startDate).split('T')[0];
          return `Your leave on ${dateStr} was ${l.status.toUpperCase()}`;
        });

        const [recentTickets]: any = await db.execute("SELECT subject FROM support_tickets WHERE username = ? AND status = 'resolved' ORDER BY id DESC LIMIT 2", [username]);
        const ticketMessages = recentTickets.map((t: any) => `🎉 Help Desk: Your ticket "${t.subject}" has been marked as RESOLVED by the IT Admin! Thanks for your feedback.`);

        const [recentProfiles]: any = await db.execute("SELECT status, admin_remarks FROM profile_requests WHERE username = ? AND status != 'pending' ORDER BY id DESC LIMIT 1", [username]);
        const profileMessages = recentProfiles.map((p: any) => {
          let msg = `👤 Profile Update: Your recent request to update your profile has been ${p.status.toUpperCase()} by the IT Admin.`;
          if (p.status === 'rejected' && p.admin_remarks) {
            msg += ` Reason: ${p.admin_remarks}`;
          }
          return msg;
        });

        const finalMessages = [...messages, ...ticketMessages, ...profileMessages];
        res.json({ count: finalMessages.length, messages: finalMessages });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications", count: 0, messages: [] });
    }
  });

  // 27. ADMINISTRATIVE PASSWORD RESET OVERRIDE ENDPOINT
  app.put("/api/admin/users/:id/reset-password", authenticateToken, requireRole(['admin']), async (req, res) => {
      const { tempPassword } = req.body;
    const targetUserId = req.params.id;

    if (typeof tempPassword !== 'string' || tempPassword.length < 12) {
      return res.status(400).json({ error: "Temporary password must be at least 12 characters long." });
    }

    try {
      const [users]: any = await db.execute("SELECT username, name FROM users WHERE id = ?", [targetUserId]);
      if (users.length === 0) {
        return res.status(404).json({ error: "User not found." });
      }
      
      const targetUser = users[0];

      const hashedTempPassword = await bcrypt.hash(tempPassword, 10);
      await db.execute(
        "UPDATE users SET password = ?, requiresPasswordChange = 1 WHERE id = ?", 
        [hashedTempPassword, targetUserId]
      );

      await db.execute(
        "INSERT INTO password_history (username, password) VALUES (?, ?)", 
        [targetUser.username, hashedTempPassword]
      );

      await db.execute(
        "INSERT INTO audit_logs (user_name, action, target, ip_address) VALUES (?, ?, ?, ?)", 
        [((req as any).user?.name || (req as any).user?.username), 'ADMIN_PASSWORD_RESET', `User @${targetUser.username}`, getClientIp(req)]
      );

      res.json({ success: true, message: `Password successfully reset for @${targetUser.username}. Changed to forced reset.` });
    } catch (error) {
      res.status(500).json({ error: "Administrative password reset failed." });
    }
  });

  // --- NEW MULTI-LEVEL APPROVAL SPECIFIC API ENDPOINTS ---

  // 28. Fetch supervisors using designation-based hierarchy
  // Supervisors = hod/admin roles OR designation matches senior faculty/management keywords
  app.get("/api/supervisors", authenticateToken, async (req, res) => {
    try {
      const [rows] = await db.execute(`
        SELECT id, name, designation, role 
        FROM users 
        WHERE 
          role IN ('hod')
          OR is_supervisor = 1
          OR designation LIKE '%Professor%'
          OR designation LIKE '%Lecturer%'
          OR designation LIKE '%IT Manager%'
          OR designation LIKE '%Data Entry%'
          OR designation LIKE '%DEO%'
          OR designation LIKE '%Chairman%'
          OR designation LIKE '%Incharge%'
          OR designation LIKE '%In-charge%'
          OR designation LIKE '%In Charge%'
        ORDER BY 
          CASE 
            WHEN role = 'hod' THEN 1
            WHEN designation LIKE '%Chairman%' THEN 2
            WHEN designation LIKE '%Professor%' AND designation NOT LIKE '%Associate%' AND designation NOT LIKE '%Assistant%' THEN 3
            WHEN designation LIKE '%Associate Professor%' THEN 4
            WHEN designation LIKE '%Assistant Professor%' THEN 5
            WHEN designation LIKE '%Lecturer%' THEN 6
            WHEN designation LIKE '%IT Manager%' THEN 7
            WHEN designation LIKE '%Data Entry%' OR designation LIKE '%DEO%' THEN 8
            ELSE 9
          END, name ASC
      `);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to load supervisors list." });
    }
  });

  // 29. Admin action mapping: Link an employee to a specific supervisor_id
  app.put("/api/admin/users/:id/assign-supervisor", authenticateToken, requireRole(['admin']), async (req, res) => {
    const targetUserId = req.params.id;
    const { supervisor_id } = req.body; 
    try {
      await db.execute(
        "UPDATE users SET supervisor_id = ? WHERE id = ?", 
        [supervisor_id || null, targetUserId]
      );
      res.json({ success: true, message: "Supervisor assignment updated successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to map employee to supervisor." });
    }
  });

  // ADMIN: Toggle is_supervisor flag on any user (UI-configurable)
  app.put("/api/admin/users/:id/toggle-supervisor", authenticateToken, requireRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { is_supervisor } = req.body; // true or false
    try {
      await db.execute(
        "UPDATE users SET is_supervisor = ? WHERE id = ?",
        [is_supervisor ? 1 : 0, id]
      );
      res.json({ success: true, message: `Supervisor status ${is_supervisor ? 'granted' : 'revoked'}.` });
    } catch (error) {
      res.status(500).json({ error: "Failed to update supervisor status." });
    }
  });

  // ═══════════════════════════════════════════════════
  // INTERNAL MEMO SYSTEM — 4 ENDPOINTS
  // ═══════════════════════════════════════════════════

  // GET: Fetch all memos for logged-in user (with optional search)
  app.get("/api/memos", authenticateToken, async (req, res) => {
    const caller = (req as any).user;
    const requestedUsername = typeof req.query.username === 'string' ? req.query.username : caller?.username;
    if (!['admin', 'hod'].includes(caller?.role) && caller?.username !== requestedUsername) {
      return res.status(403).json({ error: "Access Denied: You can only view your own memos." });
    }
    const username = requestedUsername || caller?.username;
    try {
      const [rows]: any = await db.execute(
        `SELECT id, memo_ref, to_field, subject, urgency, from_name, from_designation,
                pers_no, main_matter, copy_to, enclosed_items, memo_date, created_at
         FROM memos
         WHERE created_by_username = ?
         ORDER BY memo_date DESC, created_at DESC`,
        [username]
      );
      const memos = rows.map((m: any) => ({
        ...m,
        copy_to: (() => { try { return JSON.parse(m.copy_to || "[]"); } catch { return []; } })(),
        enclosed_items: (() => { try { return JSON.parse(m.enclosed_items || "[]"); } catch { return []; } })(),
      }));
      res.json(memos);
    } catch (error) {
      console.error("GET /api/memos error:", error);
      res.status(500).json({ error: "Failed to load memos." });
    }
  });

  // POST: Create new memo
  app.post("/api/memos", authenticateToken, async (req, res) => {
    const caller = (req as any).user;
    const username = caller?.username || req.body.username;
    const {
      to_field, subject, urgency, from_name, from_designation,
      pers_no, main_matter, copy_to, enclosed_items, memo_ref, memo_date
    } = req.body;

    if (!username || !to_field || !subject) {
      return res.status(400).json({ error: "Username, To, and Subject are required." });
    }
    try {
      const [result]: any = await db.execute(
        `INSERT INTO memos
          (created_by_username, memo_ref, to_field, subject, urgency, from_name,
           from_designation, pers_no, main_matter, copy_to, enclosed_items, memo_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          username,
          memo_ref || "MYD-",
          to_field,
          subject,
          urgency || "ROUTINE",
          from_name || "",
          from_designation || "",
          pers_no || "",
          main_matter || "",
          JSON.stringify(Array.isArray(copy_to) ? copy_to : []),
          JSON.stringify(Array.isArray(enclosed_items) ? enclosed_items : []),
          memo_date || new Date().toISOString().slice(0, 10),
        ]
      );
      res.status(201).json({ success: true, id: result.insertId });
    } catch (error) {
      console.error("POST /api/memos error:", error);
      res.status(500).json({ error: "Failed to create memo." });
    }
  });

  // PUT: Update existing memo (owner only)
  app.put("/api/memos", authenticateToken, async (req, res) => {
    const caller = (req as any).user;
    const username = caller?.username || req.body.username;
    const {
      id, to_field, subject, urgency, from_name, from_designation,
      pers_no, main_matter, copy_to, enclosed_items, memo_ref, memo_date
    } = req.body;

    if (!id) return res.status(400).json({ error: "Memo ID required for update." });
    try {
      await db.execute(
        `UPDATE memos SET
          memo_ref = ?, to_field = ?, subject = ?, urgency = ?, from_name = ?,
          from_designation = ?, pers_no = ?, main_matter = ?,
          copy_to = ?, enclosed_items = ?, memo_date = ?
         WHERE id = ? AND created_by_username = ?`,
        [
          memo_ref || "MYD-",
          to_field,
          subject,
          urgency || "ROUTINE",
          from_name || "",
          from_designation || "",
          pers_no || "",
          main_matter || "",
          JSON.stringify(Array.isArray(copy_to) ? copy_to : []),
          JSON.stringify(Array.isArray(enclosed_items) ? enclosed_items : []),
          memo_date || new Date().toISOString().slice(0, 10),
          id,
          username,
        ]
      );
      res.json({ success: true, id });
    } catch (error) {
      console.error("PUT /api/memos error:", error);
      res.status(500).json({ error: "Failed to update memo." });
    }
  });

  // DELETE: Remove a memo (owner only)
  app.delete("/api/memos/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const username = (req as any).user?.username;
    try {
      const [result]: any = await db.execute(
        "DELETE FROM memos WHERE id = ? AND created_by_username = ?",
        [id, username]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Memo not found or access denied." });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("DELETE /api/memos error:", error);
      res.status(500).json({ error: "Failed to delete memo." });
    }
  });

  // --- END OF REST API ---

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => {
    console.log(`🚀 Leave Management Portal running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
