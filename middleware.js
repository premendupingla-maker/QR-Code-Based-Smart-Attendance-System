const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./config");

/**
 * auth(["student"]) / auth(["teacher"]) / auth(["admin"]) / auth() for any logged-in role
 * Expects header: Authorization: Bearer <token>
 * Sets req.user = { id, role, name/email/username }
 */
const auth = (roles = []) => {
  if (typeof roles === "string") roles = [roles];

  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Access denied for this role" });
      }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  };
};

module.exports = auth;
