const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const { db, admin, firebaseAuth } = require("../auth/firebaseConfig");

const router = express.Router();

// Rate limiter for admin authentication routes
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 requests per windowMs for admin routes
  message: { 
    success: false,
    error: "Too many admin authentication attempts, please try again later." 
  }
});

router.use(adminAuthLimiter);

// JWT Secret validation
if (!process.env.JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET not set, using default for development");
  process.env.JWT_SECRET = "development-jwt-secret-key";
}

// Helper: Generate JWT Token for Admin
const generateAdminToken = (admin) => {
  return jwt.sign(
    { uid: admin.uid, email: admin.email, role: admin.role, permissions: admin.permissions },
    process.env.JWT_SECRET,
    { expiresIn: "24h" } // Shorter expiry for admin tokens
  );
};

// Helper: Standard Response
const sendResponse = (res, statusCode, success, data = null, message = null, error = null, details = null) => {
  const response = { success };
  if (message) response.message = message;
  if (data) response.data = data;
  if (error) response.error = error;
  if (details) response.details = details;
  
  res.status(statusCode).json(response);
};

// POST /admin/auth/login - Admin Login
router.post("/login", [
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 6 }).withMessage("Password is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { email, password } = req.body;

    // For development with mock auth, create a mock admin if it doesn't exist
    let uid = 'admin-uid-' + email.replace(/[^a-zA-Z0-9]/g, '');
    
    const adminRef = db.collection("admins").doc(uid);
    let adminSnap = await adminRef.get();

    if (!adminSnap.exists) {
      // Create mock admin for development
      const adminData = {
        uid,
        email,
        firstName: "Admin",
        lastName: "User",
        role: "admin",
        isActive: true,
        permissions: {
          manageProducts: true,
          manageOrders: true,
          manageUsers: true,
          manageCoupons: true,
          viewAnalytics: true,
          manageSettings: true
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: null
      };
      
      await adminRef.set(adminData);
      adminSnap = await adminRef.get();
    }

    const adminData = adminSnap.data();

    // Ensure admin is active for development
    if (!adminData.isActive) {
      await adminRef.update({ isActive: true });
    }

    await adminRef.update({
      lastLogin: new Date(),
      updatedAt: new Date()
    });

    const token = generateAdminToken(adminData);

    sendResponse(res, 200, true, {
      admin: {
        uid: adminData.uid,
        email: adminData.email,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions
      },
      token
    }, "Admin login successful");

  } catch (error) {
    console.error("Admin login error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during admin login");
  }
});

// GET /admin/auth/verify - Verify Admin Token
router.get("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.admin_token;

    if (!token) {
      return sendResponse(res, 401, false, null, null, "No token provided");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get admin data from database
    const adminRef = db.collection("admins").doc(decoded.uid);
    const adminSnap = await adminRef.get();

    if (!adminSnap.exists) {
      return sendResponse(res, 401, false, null, null, "Admin not found");
    }

    const adminData = adminSnap.data();

    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled");
    }

    sendResponse(res, 200, true, {
      admin: {
        uid: adminData.uid,
        email: adminData.email,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions
      }
    }, "Token verified successfully");

  } catch (error) {
    console.error("Admin token verification error:", error);
    if (error.name === 'JsonWebTokenError') {
      return sendResponse(res, 401, false, null, null, "Invalid token");
    }
    if (error.name === 'TokenExpiredError') {
      return sendResponse(res, 401, false, null, null, "Token expired");
    }
    sendResponse(res, 500, false, null, null, "Internal server error during token verification");
  }
});

// POST /admin/auth/logout - Admin Logout
router.post("/logout", async (req, res) => {
  try {
    // Clear cookie if it exists
    res.clearCookie('admin_token');
    
    sendResponse(res, 200, true, null, "Admin logout successful");
  } catch (error) {
    console.error("Admin logout error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during admin logout");
  }
});

// POST /admin/auth/refresh - Refresh Admin Token
router.post("/refresh", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.admin_token;

    if (!token) {
      return sendResponse(res, 401, false, null, null, "No token provided");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get admin data from database
    const adminRef = db.collection("admins").doc(decoded.uid);
    const adminSnap = await adminRef.get();

    if (!adminSnap.exists) {
      return sendResponse(res, 401, false, null, null, "Admin not found");
    }

    const adminData = adminSnap.data();

    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled");
    }

    const newToken = generateAdminToken(adminData);

    sendResponse(res, 200, true, {
      admin: {
        uid: adminData.uid,
        email: adminData.email,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions
      },
      token: newToken
    }, "Token refreshed successfully");

  } catch (error) {
    console.error("Admin token refresh error:", error);
    if (error.name === 'JsonWebTokenError') {
      return sendResponse(res, 401, false, null, null, "Invalid token");
    }
    if (error.name === 'TokenExpiredError') {
      return sendResponse(res, 401, false, null, null, "Token expired");
    }
    sendResponse(res, 500, false, null, null, "Internal server error during token refresh");
  }
});

// GET /admin/auth/profile - Get Admin Profile
router.get("/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.admin_token;

    if (!token) {
      return sendResponse(res, 401, false, null, null, "No token provided");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get admin data from database
    const adminRef = db.collection("admins").doc(decoded.uid);
    const adminSnap = await adminRef.get();

    if (!adminSnap.exists) {
      return sendResponse(res, 401, false, null, null, "Admin not found");
    }

    const adminData = adminSnap.data();

    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled");
    }

    sendResponse(res, 200, true, {
      uid: adminData.uid,
      email: adminData.email,
      firstName: adminData.firstName,
      lastName: adminData.lastName,
      role: adminData.role,
      permissions: adminData.permissions,
      lastLogin: adminData.lastLogin,
      createdAt: adminData.createdAt
    }, "Admin profile retrieved successfully");

  } catch (error) {
    console.error("Admin profile error:", error);
    if (error.name === 'JsonWebTokenError') {
      return sendResponse(res, 401, false, null, null, "Invalid token");
    }
    if (error.name === 'TokenExpiredError') {
      return sendResponse(res, 401, false, null, null, "Token expired");
    }
    sendResponse(res, 500, false, null, null, "Internal server error during profile retrieval");
  }
});

module.exports = router;

