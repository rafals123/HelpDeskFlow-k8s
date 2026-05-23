const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const {
  loadEnv,
  query,
  sanitizeUser,
  signToken,
  testConnection,
} = require("@helpdeskflow/shared");

loadEnv();

const app = express();
const port = Number(process.env.AUTH_SERVICE_PORT || 4001);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "auth-service", status: "ok" });
});

app.post("/auth/register", async (req, res) => {
  const fullName = req.body.fullName?.trim();
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password?.trim();

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: "fullName, email and password are required." });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters long." });
  }

  try {
    const existingUser = await query("SELECT id FROM users WHERE email = $1", [email]);

    if (existingUser.rowCount > 0) {
      return res.status(409).json({ message: "User with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertResult = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'USER')
       RETURNING id, full_name, email, role`,
      [fullName, email, passwordHash],
    );

    const user = sanitizeUser(insertResult.rows[0]);
    return res.status(201).json({
      token: signToken(user),
      user,
    });
  } catch (error) {
    console.error("Registration failed", error);
    return res.status(500).json({ message: "Registration failed." });
  }
});

app.post("/auth/login", async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password?.trim();

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required." });
  }

  try {
    const userResult = await query(
      `SELECT id, full_name, email, role, password_hash
       FROM users
       WHERE email = $1`,
      [email],
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = userResult.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const safeUser = sanitizeUser(user);
    return res.json({
      token: signToken(safeUser),
      user: safeUser,
    });
  } catch (error) {
    console.error("Login failed", error);
    return res.status(500).json({ message: "Login failed." });
  }
});

async function ensureSeedUser({ fullName, email, password, role }) {
  const existing = await query("SELECT id FROM users WHERE email = $1", [email]);

  if (existing.rowCount > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)`,
    [fullName, email.toLowerCase(), passwordHash, role],
  );
}

async function start() {
  try {
    await testConnection();

    await ensureSeedUser({
      fullName: "Default Support Rep",
      email: process.env.SEED_SUPPORT_EMAIL || "support@helpdeskflow.local",
      password: process.env.SEED_SUPPORT_PASSWORD || "Support123!",
      role: "SUPPORT_REP",
    });

    await ensureSeedUser({
      fullName: "System Administrator",
      email: process.env.SEED_ADMIN_EMAIL || "admin@helpdeskflow.local",
      password: process.env.SEED_ADMIN_PASSWORD || "Admin123!",
      role: "ADMIN",
    });

    app.listen(port, () => {
      console.log(`Auth service listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Auth service failed to start", error);
    process.exit(1);
  }
}

start();
