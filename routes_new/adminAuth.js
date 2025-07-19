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

// POST /api/admin/auth/login - Admin Login
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

    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled");
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
        name: `${adminData.firstName} ${adminData.lastName}`,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions
      },
      token
    }, "Admin login successful");

  } catch (error) {
    console.error("❌ Admin login error:", error.message);
    sendResponse(res, 401, false, null, null, "Invalid admin credentials", error.message);
  }
});

// GET /api/admin/auth/profile - Get Admin Profile
router.get("/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return sendResponse(res, 401, false, null, null, "Token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Admin access required");
    }

    const adminSnap = await db.collection("admins").doc(decoded.uid).get();

    if (!adminSnap.exists) {
      return sendResponse(res, 404, false, null, null, "Admin not found");
    }

    const adminData = adminSnap.data();
    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled");
    }

    sendResponse(res, 200, true, {
      admin: {
        uid: adminData.uid,
        email: adminData.email,
        name: `${adminData.firstName} ${adminData.lastName}`,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions,
        lastLogin: adminData.lastLogin?.toDate(),
        createdAt: adminData.createdAt?.toDate()
      }
    }, "Admin profile fetched successfully");

  } catch (error) {
    console.error("❌ Admin profile error:", error.message);
    sendResponse(res, 401, false, null, null, "Invalid or expired token", error.message);
  }
});

// POST /api/admin/auth/verify - Admin Token Verification
router.post("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return sendResponse(res, 401, false, null, null, "Token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Admin access required");
    }

    const adminSnap = await db.collection("admins").doc(decoded.uid).get();

    if (!adminSnap.exists) {
      return sendResponse(res, 404, false, null, null, "Admin not found");
    }

    const adminData = adminSnap.data();
    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled");
    }

    sendResponse(res, 200, true, {
      admin: {
        uid: adminData.uid,
        email: adminData.email,
        name: `${adminData.firstName} ${adminData.lastName}`,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions
      }
    }, "Admin token verified successfully");

  } catch (error) {
    console.error("❌ Admin token verification error:", error.message);
    sendResponse(res, 401, false, null, null, "Invalid or expired admin token", error.message);
  }
});

// POST /api/admin/auth/logout - Admin Logout
router.post("/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Update last logout time
        if (decoded.uid && decoded.role === 'admin') {
          const adminRef = db.collection("admins").doc(decoded.uid);
          await adminRef.update({
            lastLogout: new Date(),
            updatedAt: new Date()
          });
        }
      } catch (tokenError) {
        // Token might be expired or invalid, but we still want to logout
        console.log("Token verification failed during logout:", tokenError.message);
      }
    }

    sendResponse(res, 200, true, null, "Admin logged out successfully");

  } catch (error) {
    console.error("❌ Admin logout error:", error.message);
    sendResponse(res, 500, false, null, null, "Logout failed", error.message);
  }
});

// POST /api/admin/auth/refresh - Refresh Admin Token
router.post("/refresh", async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return sendResponse(res, 401, false, null, null, "Token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Admin access required");
    }

    const adminSnap = await db.collection("admins").doc(decoded.uid).get();

    if (!adminSnap.exists) {
      return sendResponse(res, 404, false, null, null, "Admin not found");
    }

    const adminData = adminSnap.data();
    if (!adminData.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account disabled");
    }

    // Generate new token
    const newToken = generateAdminToken(adminData);

    await db.collection("admins").doc(decoded.uid).update({
      lastTokenRefresh: new Date(),
      updatedAt: new Date()
    });

    sendResponse(res, 200, true, {
      admin: {
        uid: adminData.uid,
        email: adminData.email,
        name: `${adminData.firstName} ${adminData.lastName}`,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: adminData.role,
        permissions: adminData.permissions
      },
      token: newToken
    }, "Admin token refreshed successfully");

  } catch (error) {
    console.error("❌ Admin token refresh error:", error.message);
    sendResponse(res, 401, false, null, null, "Token refresh failed", error.message);
  }
});

// PUT /api/admin/auth/profile - Update Admin Profile
router.put("/profile", [
  body("firstName").optional().notEmpty().withMessage("First name cannot be empty"),
  body("lastName").optional().notEmpty().withMessage("Last name cannot be empty")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return sendResponse(res, 401, false, null, null, "Token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Admin access required");
    }

    const { firstName, lastName } = req.body;

    const adminRef = db.collection("admins").doc(decoded.uid);
    const adminDoc = await adminRef.get();

    if (!adminDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Admin not found");
    }

    const updateData = {
      updatedAt: new Date()
    };

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;

    await adminRef.update(updateData);

    const updatedDoc = await adminRef.get();
    const updatedData = updatedDoc.data();

    sendResponse(res, 200, true, {
      admin: {
        uid: updatedData.uid,
        email: updatedData.email,
        name: `${updatedData.firstName} ${updatedData.lastName}`,
        firstName: updatedData.firstName,
        lastName: updatedData.lastName,
        role: updatedData.role,
        permissions: updatedData.permissions
      }
    }, "Admin profile updated successfully");

  } catch (error) {
    console.error("❌ Admin profile update error:", error.message);
    sendResponse(res, 401, false, null, null, "Profile update failed", error.message);
  }
});

module.exports = router;

