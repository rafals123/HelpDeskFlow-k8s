const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const {
  loadEnv,
  query,
  testConnection,
} = require("@helpdeskflow/shared");

loadEnv();

const app = express();
const port = Number(process.env.NOTIFICATION_SERVICE_PORT || 4004);
const notificationMode = (process.env.NOTIFICATION_MODE || "simulation").toLowerCase();
const internalServiceToken = process.env.INTERNAL_SERVICE_TOKEN || "change-me-internal-token";

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "notification-service", status: "ok" });
});

function getTransporter() {
  if (notificationMode !== "smtp") {
    return null;
  }

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 0);

  if (!host || !port) {
    throw new Error("SMTP_HOST and SMTP_PORT must be set when NOTIFICATION_MODE=smtp.");
  }

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const auth =
    smtpUser && smtpPass
      ? {
          user: smtpUser,
          pass: smtpPass,
        }
      : undefined;

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth,
  });
}

function authenticateInternalRequest(req, res, next) {
  const providedToken = req.get("x-internal-token");

  if (providedToken !== internalServiceToken) {
    return res.status(403).json({ message: "Forbidden." });
  }

  return next();
}

app.post("/notifications/status-change", authenticateInternalRequest, async (req, res) => {
  const {
    caseId,
    caseNumber,
    title,
    recipientEmail,
    recipientName,
    oldStatus,
    newStatus,
  } = req.body;

  if (!caseId || !caseNumber || !recipientEmail || !oldStatus || !newStatus) {
    return res.status(400).json({ message: "Missing notification payload." });
  }

  const transporter = getTransporter();
  let deliveryStatus = "SIMULATED";
  let errorMessage = null;

  try {
    if (transporter) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: recipientEmail,
        subject: `[HelpDeskFlow] ${caseNumber} status changed to ${newStatus}`,
        text: [
          `Hello ${recipientName || "user"},`,
          "",
          `The status of your case ${caseNumber} has changed.`,
          `Title: ${title}`,
          `Previous status: ${oldStatus}`,
          `Current status: ${newStatus}`,
          "",
          "This message was sent by HelpDeskFlow.",
        ].join("\n"),
      });

      deliveryStatus = "SENT";
    } else {
      console.log(
        `Simulated notification for ${recipientEmail}: ${caseNumber} ${oldStatus} -> ${newStatus}`,
      );
    }
  } catch (error) {
    console.error("Email notification failed", error);
    deliveryStatus = "FAILED";
    errorMessage = error.message;
  }

  try {
    await query(
      `INSERT INTO notifications (case_id, recipient_email, type, delivery_status, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [caseId, recipientEmail, "STATUS_CHANGE", deliveryStatus, errorMessage],
    );
  } catch (error) {
    console.error("Could not persist notification event", error);
  }

  return res.status(deliveryStatus === "FAILED" ? 502 : 200).json({
    deliveryStatus,
    message:
      deliveryStatus === "SENT"
        ? "Email sent."
        : deliveryStatus === "SIMULATED"
          ? "SMTP not configured, notification simulated."
          : "Email sending failed.",
  });
});

async function start() {
  try {
    await testConnection();

    if (!["simulation", "smtp"].includes(notificationMode)) {
      throw new Error("NOTIFICATION_MODE must be either simulation or smtp.");
    }

    if (notificationMode === "smtp") {
      getTransporter();
    }

    app.listen(port, () => {
      console.log(`Notification service listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Notification service failed to start", error);
    process.exit(1);
  }
}

start();
