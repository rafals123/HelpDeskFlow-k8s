const express = require("express");
const cors = require("cors");
const {
  authenticate,
  loadEnv,
  query,
  testConnection,
} = require("@helpdeskflow/shared");

loadEnv();

const app = express();
const port = Number(process.env.USER_SERVICE_PORT || 4002);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "user-service", status: "ok" });
});

app.get("/users/me", authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, email, role, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const row = result.rows[0];

    return res.json({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error("Could not fetch current user", error);
    return res.status(500).json({ message: "Could not fetch current user." });
  }
});

app.get("/users/support-reps", authenticate, async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, email, role
       FROM users
       WHERE role = 'SUPPORT_REP'
       ORDER BY full_name ASC`,
    );

    return res.json(
      result.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        role: row.role,
      })),
    );
  } catch (error) {
    console.error("Could not fetch support reps", error);
    return res.status(500).json({ message: "Could not fetch support reps." });
  }
});

async function start() {
  try {
    await testConnection();
    app.listen(port, () => {
      console.log(`User service listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("User service failed to start", error);
    process.exit(1);
  }
}

start();
