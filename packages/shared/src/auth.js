const jwt = require("jsonwebtoken");
const { loadEnv } = require("./load-env");

loadEnv();

function sanitizeUser(user) {
  return {
    id: user.id,
    fullName: user.full_name || user.fullName,
    email: user.email,
    role: user.role,
  };
}

function signToken(user) {
  return jwt.sign(sanitizeUser(user), process.env.JWT_SECRET || "change-me", {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });
}

function authenticate(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing bearer token." });
  }

  const token = authorization.slice("Bearer ".length);

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "change-me");
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions." });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  requireRoles,
  sanitizeUser,
  signToken,
};
