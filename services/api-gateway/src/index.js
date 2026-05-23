const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const { createProxyMiddleware } = require("http-proxy-middleware");

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

const app = express();
const port = Number(process.env.API_GATEWAY_PORT || 8080);

const serviceMap = {
  auth: {
    target: process.env.AUTH_SERVICE_URL || "http://localhost:4001",
    rewriteTo: "/auth",
  },
  users: {
    target: process.env.USER_SERVICE_URL || "http://localhost:4002",
    rewriteTo: "/users",
  },
  cases: {
    target: process.env.TICKET_SERVICE_URL || "http://localhost:4003",
    rewriteTo: "/cases",
  },
  notifications: {
    target: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4004",
    rewriteTo: "/notifications",
  },
};

app.use(cors());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({
    service: "api-gateway",
    status: "ok",
    services: Object.fromEntries(
      Object.entries(serviceMap).map(([serviceName, config]) => [serviceName, config.target]),
    ),
  });
});

app.get("/api", (_req, res) => {
  res.json({
    message: "HelpDeskFlow API Gateway",
    services: Object.fromEntries(
      Object.entries(serviceMap).map(([serviceName, config]) => [serviceName, config.target]),
    ),
  });
});

Object.entries(serviceMap).forEach(([route, config]) => {
  app.use(
    `/api/${route}`,
    createProxyMiddleware({
      target: config.target,
      changeOrigin: true,
      logLevel: "warn",
      pathRewrite: (path) => `${config.rewriteTo}${path === "/" ? "" : path}`,
    }),
  );
});

app.listen(port, () => {
  console.log(`API Gateway listening on http://localhost:${port}`);
});
