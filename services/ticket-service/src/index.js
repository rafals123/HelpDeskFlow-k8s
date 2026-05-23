const express = require("express");
const cors = require("cors");
const {
  authenticate,
  loadEnv,
  query,
  requireRoles,
  testConnection,
  withTransaction,
} = require("@helpdeskflow/shared");

loadEnv();

const app = express();
const port = Number(process.env.TICKET_SERVICE_PORT || 4003);
const VALID_STATUSES = ["NEW", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"];
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "ticket-service", status: "ok" });
});

function mapCase(row) {
  return {
    id: row.id,
    caseNumber: row.case_number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commentsCount: Number(row.comments_count || 0),
    reportedBy: {
      id: row.reported_by_id,
      fullName: row.reported_by_name,
      email: row.reported_by_email,
    },
    supportRep: row.support_rep_id
      ? {
          id: row.support_rep_id,
          fullName: row.support_rep_name,
          email: row.support_rep_email,
        }
      : null,
  };
}

async function fetchCaseList(user) {
  const params = [];
  let accessSql = "";

  if (user.role === "USER") {
    params.push(user.id);
    accessSql = "WHERE c.reported_by = $1";
  }

  const result = await query(
    `SELECT
       c.id,
       c.case_number,
       c.title,
       c.description,
       c.status,
       c.priority,
       c.created_at,
       c.updated_at,
       reporter.id AS reported_by_id,
       reporter.full_name AS reported_by_name,
       reporter.email AS reported_by_email,
       support_rep.id AS support_rep_id,
       support_rep.full_name AS support_rep_name,
       support_rep.email AS support_rep_email,
       (SELECT COUNT(*) FROM case_comments cc WHERE cc.case_id = c.id) AS comments_count
     FROM cases c
     JOIN users reporter ON reporter.id = c.reported_by
     LEFT JOIN users support_rep ON support_rep.id = c.support_rep_id
     ${accessSql}
     ORDER BY c.created_at DESC`,
    params,
  );

  return result.rows.map(mapCase);
}

async function fetchCaseById(caseId) {
  const result = await query(
    `SELECT
       c.id,
       c.case_number,
       c.title,
       c.description,
       c.status,
       c.priority,
       c.created_at,
       c.updated_at,
       reporter.id AS reported_by_id,
       reporter.full_name AS reported_by_name,
       reporter.email AS reported_by_email,
       support_rep.id AS support_rep_id,
       support_rep.full_name AS support_rep_name,
       support_rep.email AS support_rep_email,
       (SELECT COUNT(*) FROM case_comments cc WHERE cc.case_id = c.id) AS comments_count
     FROM cases c
     JOIN users reporter ON reporter.id = c.reported_by
     LEFT JOIN users support_rep ON support_rep.id = c.support_rep_id
     WHERE c.id = $1`,
    [caseId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapCase(result.rows[0]);
}

async function fetchComments(caseId) {
  const result = await query(
    `SELECT
       cc.id,
       cc.content,
       cc.created_at,
       author.id AS author_id,
       author.full_name AS author_name,
       author.email AS author_email,
       author.role AS author_role
     FROM case_comments cc
     JOIN users author ON author.id = cc.author_id
     WHERE cc.case_id = $1
     ORDER BY cc.created_at ASC`,
    [caseId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    author: {
      id: row.author_id,
      fullName: row.author_name,
      email: row.author_email,
      role: row.author_role,
    },
  }));
}

async function fetchHistory(caseId) {
  const result = await query(
    `SELECT
       ch.id,
       ch.action,
       ch.old_value,
       ch.new_value,
       ch.created_at,
       actor.id AS actor_id,
       actor.full_name AS actor_name,
       actor.email AS actor_email
     FROM case_history ch
     JOIN users actor ON actor.id = ch.changed_by
     WHERE ch.case_id = $1
     ORDER BY ch.created_at ASC`,
    [caseId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
    changedBy: {
      id: row.actor_id,
      fullName: row.actor_name,
      email: row.actor_email,
    },
  }));
}

function canAccessCase(user, caseRecord) {
  if (!caseRecord) {
    return false;
  }

  if (user.role === "USER") {
    return caseRecord.reportedBy.id === user.id;
  }

  return true;
}

async function buildCaseResponse(caseId) {
  const caseRecord = await fetchCaseById(caseId);

  if (!caseRecord) {
    return null;
  }

  return {
    ...caseRecord,
    comments: await fetchComments(caseId),
    history: await fetchHistory(caseId),
  };
}

async function sendStatusChangeNotification(caseRecord, oldStatus, newStatus) {
  const notificationUrl =
    process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4004";

  try {
    await fetch(`${notificationUrl}/notifications/status-change`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        caseId: caseRecord.id,
        caseNumber: caseRecord.caseNumber,
        title: caseRecord.title,
        recipientEmail: caseRecord.reportedBy.email,
        recipientName: caseRecord.reportedBy.fullName,
        oldStatus,
        newStatus,
      }),
    });
  } catch (error) {
    console.error("Status notification failed", error);
  }
}

app.get("/cases", authenticate, async (req, res) => {
  try {
    const cases = await fetchCaseList(req.user);
    return res.json(cases);
  } catch (error) {
    console.error("Could not fetch cases", error);
    return res.status(500).json({ message: "Could not fetch cases." });
  }
});

app.post("/cases", authenticate, async (req, res) => {
  const title = req.body.title?.trim();
  const description = req.body.description?.trim();
  const priority = req.body.priority?.trim().toUpperCase() || "MEDIUM";

  if (!title || !description) {
    return res.status(400).json({ message: "title and description are required." });
  }

  if (!VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ message: "Invalid priority." });
  }

  try {
    const caseId = await withTransaction(async (client) => {
      const insertResult = await client.query(
        `INSERT INTO cases (title, description, priority, reported_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [title, description, priority, req.user.id],
      );

      const createdCaseId = insertResult.rows[0].id;

      await client.query(
        `INSERT INTO case_history (case_id, changed_by, action, new_value)
         VALUES ($1, $2, 'CASE_CREATED', $3)`,
        [createdCaseId, req.user.id, "Case created"],
      );

      return createdCaseId;
    });

    const response = await buildCaseResponse(caseId);
    return res.status(201).json(response);
  } catch (error) {
    console.error("Could not create case", error);
    return res.status(500).json({ message: "Could not create case." });
  }
});

app.get("/cases/:id", authenticate, async (req, res) => {
  try {
    const caseRecord = await buildCaseResponse(Number(req.params.id));

    if (!caseRecord) {
      return res.status(404).json({ message: "Case not found." });
    }

    if (!canAccessCase(req.user, caseRecord)) {
      return res.status(403).json({ message: "Access denied." });
    }

    return res.json(caseRecord);
  } catch (error) {
    console.error("Could not fetch case", error);
    return res.status(500).json({ message: "Could not fetch case." });
  }
});

app.patch(
  "/cases/:id/assign",
  authenticate,
  requireRoles("SUPPORT_REP", "ADMIN"),
  async (req, res) => {
    const caseId = Number(req.params.id);
    const supportRepId = req.body.supportRepId ? Number(req.body.supportRepId) : null;

    try {
      const existingCase = await fetchCaseById(caseId);

      if (!existingCase) {
        return res.status(404).json({ message: "Case not found." });
      }

      let supportRepName = null;

      if (supportRepId) {
        const supportRepResult = await query(
          `SELECT id, full_name, role
           FROM users
           WHERE id = $1`,
          [supportRepId],
        );

        if (supportRepResult.rowCount === 0) {
          return res.status(404).json({ message: "Support rep not found." });
        }

        const supportRep = supportRepResult.rows[0];

        if (supportRep.role !== "SUPPORT_REP") {
          return res.status(400).json({ message: "Selected user is not a support rep." });
        }

        supportRepName = supportRep.full_name;
      }

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE cases
           SET support_rep_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [supportRepId, caseId],
        );

        await client.query(
          `INSERT INTO case_history (case_id, changed_by, action, old_value, new_value)
           VALUES ($1, $2, 'SUPPORT_REP_UPDATED', $3, $4)`,
          [
            caseId,
            req.user.id,
            existingCase.supportRep?.fullName || "Unassigned",
            supportRepName || "Unassigned",
          ],
        );
      });

      const updatedCase = await buildCaseResponse(caseId);
      return res.json(updatedCase);
    } catch (error) {
      console.error("Could not assign support rep", error);
      return res.status(500).json({ message: "Could not assign support rep." });
    }
  },
);

app.patch(
  "/cases/:id/status",
  authenticate,
  requireRoles("SUPPORT_REP", "ADMIN"),
  async (req, res) => {
    const caseId = Number(req.params.id);
    const newStatus = req.body.status?.trim().toUpperCase();

    if (!VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    try {
      const existingCase = await fetchCaseById(caseId);

      if (!existingCase) {
        return res.status(404).json({ message: "Case not found." });
      }

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE cases
           SET status = $1, updated_at = NOW()
           WHERE id = $2`,
          [newStatus, caseId],
        );

        await client.query(
          `INSERT INTO case_history (case_id, changed_by, action, old_value, new_value)
           VALUES ($1, $2, 'STATUS_UPDATED', $3, $4)`,
          [caseId, req.user.id, existingCase.status, newStatus],
        );
      });

      const updatedCase = await buildCaseResponse(caseId);
      await sendStatusChangeNotification(updatedCase, existingCase.status, newStatus);
      return res.json(updatedCase);
    } catch (error) {
      console.error("Could not update case status", error);
      return res.status(500).json({ message: "Could not update case status." });
    }
  },
);

app.post("/cases/:id/comments", authenticate, async (req, res) => {
  const caseId = Number(req.params.id);
  const content = req.body.content?.trim();

  if (!content) {
    return res.status(400).json({ message: "Comment content is required." });
  }

  try {
    const existingCase = await fetchCaseById(caseId);

    if (!existingCase) {
      return res.status(404).json({ message: "Case not found." });
    }

    if (!canAccessCase(req.user, existingCase)) {
      return res.status(403).json({ message: "Access denied." });
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO case_comments (case_id, author_id, content)
         VALUES ($1, $2, $3)`,
        [caseId, req.user.id, content],
      );

      await client.query(
        `INSERT INTO case_history (case_id, changed_by, action, new_value)
         VALUES ($1, $2, 'COMMENT_ADDED', $3)`,
        [caseId, req.user.id, "Comment added"],
      );
    });

    const updatedCase = await buildCaseResponse(caseId);
    return res.status(201).json(updatedCase);
  } catch (error) {
    console.error("Could not add comment", error);
    return res.status(500).json({ message: "Could not add comment." });
  }
});

app.get("/cases/:id/history", authenticate, async (req, res) => {
  const caseId = Number(req.params.id);

  try {
    const existingCase = await fetchCaseById(caseId);

    if (!existingCase) {
      return res.status(404).json({ message: "Case not found." });
    }

    if (!canAccessCase(req.user, existingCase)) {
      return res.status(403).json({ message: "Access denied." });
    }

    return res.json(await fetchHistory(caseId));
  } catch (error) {
    console.error("Could not fetch case history", error);
    return res.status(500).json({ message: "Could not fetch case history." });
  }
});

async function start() {
  try {
    await testConnection();
    app.listen(port, () => {
      console.log(`Ticket service listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Ticket service failed to start", error);
    process.exit(1);
  }
}

start();
