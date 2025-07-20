const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const { db, admin, firebaseAuth } = require("../auth/firebaseConfig");

const router = express.Router();

// Rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: { 
    success: false,
    error: "Too many authentication attempts, please try again later." 
  }
});

router.use(authLimiter);

// JWT Secret validation
if (!process.env.JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET not set, using default for development");
  process.env.JWT_SECRET = "development-jwt-secret-key";
}

// Helper: Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { uid: user.uid, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
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

// POST /api/auth/register - User Registration
router.post("/register", [
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("firstName").notEmpty().withMessage("First name is required"),
  body("lastName").notEmpty().withMessage("Last name is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { email, password, firstName, lastName, phoneNumber } = req.body;

    // Create user in Firebase Auth
    const firebaseUser = await firebaseAuth.createUser({
      email,
      password,
      emailVerified: false
    });
    
    const uid = firebaseUser.uid;
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return sendResponse(res, 409, false, null, null, "User already exists");
    }

    const userData = {
      uid,
      email,
      firstName,
      lastName,
      phoneNumber: phoneNumber || "",
      role: "customer",
      isActive: true,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: null,
      preferences: { newsletter: true, notifications: true },
      addresses: [],
      orderHistory: []
    };

    await userRef.set(userData);
    const token = generateToken(userData);

    sendResponse(res, 201, true, {
      user: {
        uid,
        email,
        name: `${firstName} ${lastName}`,
        firstName,
        lastName,
        role: "customer"
      },
      token
    }, "User registered successfully");

  } catch (error) {
    console.error("❌ Register error:", error.message);
    sendResponse(res, 500, false, null, null, "Registration failed", error.message);
  }
});

// POST /api/auth/register-token - Registration via Firebase Token
router.post("/register-token", [
  body("idToken").notEmpty().withMessage("ID token is required"),
  body("firstName").notEmpty().withMessage("First name is required"),
  body("lastName").notEmpty().withMessage("Last name is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { idToken, firstName, lastName, phoneNumber } = req.body;
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const { uid, email } = decoded;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return sendResponse(res, 409, false, null, null, "User already exists");
    }

    const userData = {
      uid,
      email,
      firstName,
      lastName,
      phoneNumber: phoneNumber || "",
      role: "customer",
      isActive: true,
      emailVerified: decoded.email_verified || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: null,
      preferences: { newsletter: true, notifications: true },
      addresses: [],
      orderHistory: []
    };

    await userRef.set(userData);
    const token = generateToken(userData);

    sendResponse(res, 201, true, {
      user: {
        uid,
        email,
        name: `${firstName} ${lastName}`,
        firstName,
        lastName,
        role: "customer"
      },
      token
    }, "User registered successfully");

  } catch (error) {
    console.error("❌ Register token error:", error.message);
    sendResponse(res, 500, false, null, null, "Registration failed", error.message);
  }
});

// POST /api/auth/login - Email/Password Login
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

    // For development with mock auth, create a mock user if it doesn't exist
    let uid = 'mock-uid-' + email.replace(/[^a-zA-Z0-9]/g, '');
    
    const userRef = db.collection("users").doc(uid);
    let userSnap = await userRef.get();

    if (!userSnap.exists) {
      // Create mock user for development
      const userData = {
        uid,
        email,
        firstName: "Mock",
        lastName: "User",
        phoneNumber: "",
        role: "customer",
        isActive: true,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: null,
        preferences: { newsletter: true, notifications: true },
        addresses: [],
        orderHistory: []
      };
      
      await userRef.set(userData);
      userSnap = await userRef.get();
    }

    const userData = userSnap.data();

    if (!userData.isActive) {
      return sendResponse(res, 403, false, null, null, "Account disabled");
    }

    await userRef.update({
      lastLogin: new Date(),
      updatedAt: new Date()
    });

    const token = generateToken(userData);

    sendResponse(res, 200, true, {
      user: {
        uid: userData.uid,
        email: userData.email,
        name: `${userData.firstName} ${userData.lastName}`,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role
      },
      token
    }, "Login successful");

  } catch (error) {
    console.error("❌ Login error:", error.message);
    sendResponse(res, 401, false, null, null, "Invalid credentials", error.message);
  }
});

// POST /api/auth/login-token - Firebase Token Login
router.post("/login-token", [
  body("idToken").notEmpty().withMessage("ID token is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { idToken } = req.body;
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const { uid, email } = decoded;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userSnap.data();

    if (!userData.isActive) {
      return sendResponse(res, 403, false, null, null, "Account disabled");
    }

    await userRef.update({
      lastLogin: new Date(),
      updatedAt: new Date()
    });

    const token = generateToken(userData);

    sendResponse(res, 200, true, {
      user: {
        uid: userData.uid,
        email: userData.email,
        name: `${userData.firstName} ${userData.lastName}`,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role
      },
      token
    }, "Login successful");

  } catch (error) {
    console.error("❌ Login token error:", error.message);
    sendResponse(res, 401, false, null, null, "Login failed", error.message);
  }
});

// POST /api/auth/google-login - Google OAuth Login
router.post("/google-login", [
  body("idToken").notEmpty().withMessage("ID token is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { idToken } = req.body;
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const { uid, email } = decoded;

    const userRef = db.collection("users").doc(uid);
    let userSnap = await userRef.get();

    // If user doesn't exist, create them automatically for Google login
    if (!userSnap.exists) {
      const userData = {
        uid,
        email,
        firstName: decoded.name?.split(' ')[0] || "User",
        lastName: decoded.name?.split(' ').slice(1).join(' ') || "",
        phoneNumber: "",
        role: "customer",
        isActive: true,
        emailVerified: decoded.email_verified || false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: null,
        preferences: { newsletter: true, notifications: true },
        addresses: [],
        orderHistory: []
      };
      
      await userRef.set(userData);
      userSnap = await userRef.get();
    }

    const userData = userSnap.data();

    if (!userData.isActive) {
      return sendResponse(res, 403, false, null, null, "Account disabled");
    }

    await userRef.update({
      lastLogin: new Date(),
      updatedAt: new Date()
    });

    const token = generateToken(userData);

    sendResponse(res, 200, true, {
      user: {
        uid: userData.uid,
        email: userData.email,
        name: `${userData.firstName} ${userData.lastName}`,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role
      },
      token
    }, "Google login successful");

  } catch (error) {
    console.error("❌ Google login error:", error.message);
    sendResponse(res, 401, false, null, null, "Google login failed", error.message);
  }
});

// POST /api/auth/verify - Token Verification
router.post("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return sendResponse(res, 401, false, null, null, "Token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userSnap = await db.collection("users").doc(decoded.uid).get();

    if (!userSnap.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userSnap.data();
    if (!userData.isActive) {
      return sendResponse(res, 403, false, null, null, "Account disabled");
    }

    sendResponse(res, 200, true, { user: userData }, "Token verified");

  } catch (error) {
    console.error("❌ Token verification error:", error.message);
    sendResponse(res, 401, false, null, null, "Invalid or expired token", error.message);
  }
});

// POST /api/auth/forgot-password - Password Reset
router.post("/forgot-password", [
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { email } = req.body;

    try {
      const link = await firebaseAuth.generatePasswordResetLink(email);

      // In production, you would email this link
      if (process.env.NODE_ENV === "development") {
        console.log("🔧 Password reset link:", link);
      }

      sendResponse(res, 200, true, null, "If email exists, a reset link was sent.");

    } catch (error) {
      console.error("Password reset error:", error.message);
      sendResponse(res, 500, false, null, null, "Failed to send reset email", error.message);
    }

  } catch (error) {
    console.error("❌ Forgot password error:", error.message);
    sendResponse(res, 500, false, null, null, "Password reset failed", error.message);
  }
});

// POST /api/auth/logout - User Logout
router.post("/logout", (req, res) => {
  sendResponse(res, 200, true, null, "Client should delete the token");
});

// POST /api/auth/verify-email - Verify email address
router.post("/verify-email", [
  body("token").notEmpty().withMessage("Verification token is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { token } = req.body;

    // For development, just mark as verified
    sendResponse(res, 200, true, null, "Email verified successfully");

  } catch (error) {
    console.error("❌ Verify email error:", error.message);
    sendResponse(res, 500, false, null, null, "Email verification failed", error.message);
  }
});

// POST /api/auth/reset-password - Reset password
router.post("/reset-password", [
  body("token").notEmpty().withMessage("Reset token is required"),
  body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { token, newPassword } = req.body;

    // For development, just return success
    sendResponse(res, 200, true, null, "Password reset successfully");

  } catch (error) {
    console.error("❌ Reset password error:", error.message);
    sendResponse(res, 500, false, null, null, "Password reset failed", error.message);
  }
});

// GET /api/auth/profile - Get user profile
router.get("/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return sendResponse(res, 401, false, null, null, "Token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userSnap = await db.collection("users").doc(decoded.uid).get();

    if (!userSnap.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userSnap.data();
    if (!userData.isActive) {
      return sendResponse(res, 403, false, null, null, "Account disabled");
    }

    // Remove sensitive information
    const { password, ...safeUserData } = userData;

    sendResponse(res, 200, true, { 
      user: {
        ...safeUserData,
        createdAt: userData.createdAt?.toDate(),
        updatedAt: userData.updatedAt?.toDate(),
        lastLogin: userData.lastLogin?.toDate()
      }
    }, "Profile fetched successfully");

  } catch (error) {
    console.error("❌ Get profile error:", error.message);
    sendResponse(res, 401, false, null, null, "Invalid or expired token", error.message);
  }
});

// POST /api/auth/refresh - Refresh token
router.post("/refresh", async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return sendResponse(res, 401, false, null, null, "Token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userSnap = await db.collection("users").doc(decoded.uid).get();

    if (!userSnap.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userSnap.data();
    if (!userData.isActive) {
      return sendResponse(res, 403, false, null, null, "Account disabled");
    }

    // Generate new token
    const newToken = generateToken(userData);

    sendResponse(res, 200, true, {
      user: {
        uid: userData.uid,
        email: userData.email,
        name: `${userData.firstName} ${userData.lastName}`,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role
      },
      token: newToken
    }, "Token refreshed successfully");

  } catch (error) {
    console.error("❌ Refresh token error:", error.message);
    sendResponse(res, 401, false, null, null, "Token refresh failed", error.message);
  }
});

module.exports = router;

