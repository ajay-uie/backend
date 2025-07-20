const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const { db, admin, firebaseAuth } = require("../auth/firebaseConfig");

const router = express.Router();

// Rate limiter for admin authentication routes - More restrictive
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for admin routes
  message: { 
    success: false,
    error: "Too many admin authentication attempts, please try again later.",
    code: "RATE_LIMITED"
  }
});

router.use(adminAuthLimiter);

// JWT Secret validation
if (!process.env.JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET not set, using default for development");
  process.env.JWT_SECRET = "development-jwt-secret-key";
}

// Admin credentials - In production, these should be stored securely in database with hashed passwords
const ADMIN_CREDENTIALS = {
  "admin@fragransia.in": {
    password: "Admin@ajay#9196", // In production, this should be hashed
    firstName: "Admin",
    lastName: "User",
    permissions: {
      manageProducts: true,
      manageOrders: true,
      manageUsers: true,
      manageCoupons: true,
      viewAnalytics: true,
      manageSettings: true
    }
  }
};

// Helper: Generate JWT Token for Admin
const generateAdminToken = (admin) => {
  return jwt.sign(
    { uid: admin.uid, email: admin.email, role: admin.role, permissions: admin.permissions },
    process.env.JWT_SECRET,
    { expiresIn: "8h" } // Shorter expiry for admin tokens
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

// Helper: Validate Admin Credentials
const validateAdminCredentials = async (email, password) => {
  try {
    // Check if email exists in admin credentials
    if (!ADMIN_CREDENTIALS[email]) {
      return { valid: false, reason: "INVALID_EMAIL" };
    }

    const adminCreds = ADMIN_CREDENTIALS[email];
    
    // Validate password (in production, use bcrypt.compare for hashed passwords)
    if (password !== adminCreds.password) {
      return { valid: false, reason: "INVALID_PASSWORD" };
    }

    return { valid: true, adminData: adminCreds };
  } catch (error) {
    console.error("Admin credential validation error:", error);
    return { valid: false, reason: "VALIDATION_ERROR" };
  }
};

// POST /login - Admin Login with proper validation
router.post("/login", [
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { email, password } = req.body;

    // Validate admin credentials
    const credentialCheck = await validateAdminCredentials(email, password);
    
    if (!credentialCheck.valid) {
      // Log failed login attempt
      console.warn(`❌ Failed admin login attempt for email: ${email}, reason: ${credentialCheck.reason}`);
      
      return sendResponse(res, 401, false, null, null, "Invalid admin credentials", {
        code: "INVALID_CREDENTIALS",
        timestamp: new Date().toISOString()
      });
    }

    // Generate unique admin ID
    const uid = 'admin-' + email.replace(/[^a-zA-Z0-9]/g, '-');
    
    const adminRef = db.collection("admins").doc(uid);
    let adminSnap = await adminRef.get();

    const adminData = {
      uid,
      email,
      firstName: credentialCheck.adminData.firstName,
      lastName: credentialCheck.adminData.lastName,
      role: "admin",
      isActive: true,
      permissions: credentialCheck.adminData.permissions,
      lastLogin: new Date(),
      updatedAt: new Date()
    };

    if (!adminSnap.exists) {
      // Create admin record in database
      adminData.createdAt = new Date();
      await adminRef.set(adminData);
    } else {
      // Update existing admin record
      await adminRef.update({
        lastLogin: new Date(),
        updatedAt: new Date(),
        isActive: true
      });
    }

    // Log successful login
    console.log(`✅ Successful admin login for: ${email}`);

    // Log admin activity
    try {
      await db.collection("admin_activity").add({
        adminId: uid,
        activity: "admin_login",
        email: email,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'] || 'Unknown',
        timestamp: new Date(),
        success: true
      });
    } catch (activityError) {
      console.error("Failed to log admin activity:", activityError);
    }

    const token = generateAdminToken(adminData);

    sendResponse(res, 200, true, {
      admin: {
        uid: adminData.uid,
        email: adminData.email,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions,
        lastLogin: adminData.lastLogin
      },
      token
    }, "Admin login successful");

  } catch (error) {
    console.error("Admin login error:", error);
    
    // Log failed login attempt
    try {
      await db.collection("admin_activity").add({
        activity: "admin_login_error",
        email: req.body.email || 'unknown',
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'] || 'Unknown',
        error: error.message,
        timestamp: new Date(),
        success: false
      });
    } catch (activityError) {
      console.error("Failed to log admin error activity:", activityError);
    }
    
    sendResponse(res, 500, false, null, null, "Internal server error during admin login");
  }
});

// GET /verify - Verify Admin Token
router.get("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.admin_token;

    if (!token) {
      return sendResponse(res, 401, false, null, null, "No token provided", { code: "NO_TOKEN" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError.message);
      
      if (jwtError.name === 'JsonWebTokenError') {
        return sendResponse(res, 401, false, null, null, "Invalid token", { code: "INVALID_TOKEN" });
      }
      if (jwtError.name === 'TokenExpiredError') {
        return sendResponse(res, 401, false, null, null, "Token expired", { code: "TOKEN_EXPIRED" });
      }
      
      return sendResponse(res, 401, false, null, null, "Token verification failed", { code: "TOKEN_ERROR" });
    }
    
    // Get admin data from database
    const adminRef = db.collection("admins").doc(decoded.uid);
    const adminSnap = await adminRef.get();

    if (!adminSnap.exists) {
      return sendResponse(res, 401, false, null, null, "Admin not found", { code: "ADMIN_NOT_FOUND" });
    }

    const adminData = adminSnap.data();

    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled", { code: "ACCOUNT_DISABLED" });
    }

    sendResponse(res, 200, true, {
      admin: {
        uid: adminData.uid,
        email: adminData.email,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions,
        lastLogin: adminData.lastLogin
      }
    }, "Token verified successfully");

  } catch (error) {
    console.error("Admin token verification error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during token verification");
  }
});

// POST /logout - Admin Logout
router.post("/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Log logout activity
        await db.collection("admin_activity").add({
          adminId: decoded.uid,
          activity: "admin_logout",
          email: decoded.email,
          ip: req.ip || req.connection.remoteAddress,
          timestamp: new Date(),
          success: true
        });
      } catch (tokenError) {
        console.warn("Could not decode token for logout logging:", tokenError.message);
      }
    }
    
    // Clear cookie if it exists
    res.clearCookie('admin_token');
    
    sendResponse(res, 200, true, null, "Admin logout successful");
  } catch (error) {
    console.error("Admin logout error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during admin logout");
  }
});

// POST /refresh - Refresh Admin Token
router.post("/refresh", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.admin_token;

    if (!token) {
      return sendResponse(res, 401, false, null, null, "No token provided", { code: "NO_TOKEN" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'JsonWebTokenError') {
        return sendResponse(res, 401, false, null, null, "Invalid token", { code: "INVALID_TOKEN" });
      }
      if (jwtError.name === 'TokenExpiredError') {
        return sendResponse(res, 401, false, null, null, "Token expired", { code: "TOKEN_EXPIRED" });
      }
      return sendResponse(res, 401, false, null, null, "Token verification failed", { code: "TOKEN_ERROR" });
    }
    
    // Get admin data from database
    const adminRef = db.collection("admins").doc(decoded.uid);
    const adminSnap = await adminRef.get();

    if (!adminSnap.exists) {
      return sendResponse(res, 401, false, null, null, "Admin not found", { code: "ADMIN_NOT_FOUND" });
    }

    const adminData = adminSnap.data();

    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled", { code: "ACCOUNT_DISABLED" });
    }

    const newToken = generateAdminToken(adminData);

    sendResponse(res, 200, true, {
      admin: {
        uid: adminData.uid,
        email: adminData.email,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions,
        lastLogin: adminData.lastLogin
      },
      token: newToken
    }, "Token refreshed successfully");

  } catch (error) {
    console.error("Admin token refresh error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during token refresh");
  }
});

// GET /profile - Get Admin Profile
router.get("/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.admin_token;

    if (!token) {
      return sendResponse(res, 401, false, null, null, "No token provided", { code: "NO_TOKEN" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'JsonWebTokenError') {
        return sendResponse(res, 401, false, null, null, "Invalid token", { code: "INVALID_TOKEN" });
      }
      if (jwtError.name === 'TokenExpiredError') {
        return sendResponse(res, 401, false, null, null, "Token expired", { code: "TOKEN_EXPIRED" });
      }
      return sendResponse(res, 401, false, null, null, "Token verification failed", { code: "TOKEN_ERROR" });
    }
    
    // Get admin data from database
    const adminRef = db.collection("admins").doc(decoded.uid);
    const adminSnap = await adminRef.get();

    if (!adminSnap.exists) {
      return sendResponse(res, 401, false, null, null, "Admin not found", { code: "ADMIN_NOT_FOUND" });
    }

    const adminData = adminSnap.data();

    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled", { code: "ACCOUNT_DISABLED" });
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
    sendResponse(res, 500, false, null, null, "Internal server error during profile retrieval");
  }
});

module.exports = router;

