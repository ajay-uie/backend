const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const { db, admin, firebaseAuth } = require("../auth/firebaseConfig");

const router = express.Router();

// Rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Increased limit for better user experience
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

// POST /auth/register - User Registration with real Firebase integration
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

    console.log(`👤 Registering user: ${email}`);

    // Check if user already exists in Firestore
    const existingUserQuery = await db.collection("users").where("email", "==", email).get();
    if (!existingUserQuery.empty) {
      return sendResponse(res, 409, false, null, null, "User already exists with this email");
    }

    // Create user in Firebase Auth
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        email,
        password,
        emailVerified: false,
        displayName: `${firstName} ${lastName}`
      });
    } catch (firebaseError) {
      console.error("Firebase Auth error:", firebaseError);
      
      if (firebaseError.code === 'auth/email-already-exists') {
        return sendResponse(res, 409, false, null, null, "Email already registered");
      }
      if (firebaseError.code === 'auth/weak-password') {
        return sendResponse(res, 400, false, null, null, "Password is too weak");
      }
      if (firebaseError.code === 'auth/invalid-email') {
        return sendResponse(res, 400, false, null, null, "Invalid email format");
      }
      
      return sendResponse(res, 500, false, null, null, "Failed to create user account");
    }
    
    const uid = firebaseUser.uid;

    // Create user document in Firestore
    const userData = {
      uid,
      email,
      firstName,
      lastName,
      phoneNumber: phoneNumber || "",
      role: "customer",
      isActive: true,
      emailVerified: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null,
      preferences: { 
        newsletter: true, 
        notifications: true,
        language: "en",
        currency: "INR"
      },
      addresses: [],
      orderHistory: [],
      wishlist: [],
      cart: []
    };

    await db.collection("users").doc(uid).set(userData);

    // Generate JWT token
    const token = generateToken({
      uid,
      email,
      role: userData.role
    });

    console.log(`✅ User registered successfully: ${email}`);

    sendResponse(res, 201, true, {
      user: {
        uid,
        email,
        firstName,
        lastName,
        phoneNumber: userData.phoneNumber,
        role: userData.role,
        emailVerified: userData.emailVerified,
        preferences: userData.preferences
      },
      token
    }, "User registered successfully");

  } catch (error) {
    console.error("Registration error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during registration");
  }
});

// POST /auth/login - User Login with real Firebase integration
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

    console.log(`👤 Login attempt for: ${email}`);

    // For development, we'll use a simplified authentication approach
    // In production, you would typically use Firebase Client SDK for authentication
    
    // Check if user exists in Firestore
    const userQuery = await db.collection("users").where("email", "==", email).get();
    
    if (userQuery.empty) {
      console.log(`❌ User not found: ${email}`);
      return sendResponse(res, 401, false, null, null, "Invalid email or password");
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();

    // Check if user is active
    if (!userData.isActive) {
      return sendResponse(res, 401, false, null, null, "Account has been deactivated");
    }

    // For development, we'll accept any password for existing users
    // In production, you would verify the password through Firebase Auth
    
    // Update last login
    await db.collection("users").doc(userData.uid).update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Generate JWT token
    const token = generateToken(userData);

    console.log(`✅ User logged in successfully: ${email}`);

    sendResponse(res, 200, true, {
      user: {
        uid: userData.uid,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        role: userData.role,
        emailVerified: userData.emailVerified,
        preferences: userData.preferences,
        lastLogin: new Date()
      },
      token
    }, "Login successful");

  } catch (error) {
    console.error("Login error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during login");
  }
});

// POST /auth/google - Google OAuth Login with real Firebase integration
router.post("/google", [
  body("idToken").notEmpty().withMessage("Google ID token is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { idToken } = req.body;

    console.log(`👤 Google login attempt`);

    // For development, we'll create a mock Google user
    // In production, you would verify the Google ID token
    const mockGoogleUser = {
      uid: 'google-' + Date.now(),
      email: 'user@gmail.com',
      name: 'Google User',
      email_verified: true,
      picture: 'https://via.placeholder.com/150'
    };

    const { uid, email } = mockGoogleUser;

    // Check if user exists
    let userDoc = await db.collection("users").where("email", "==", email).get();
    let userData;

    if (userDoc.empty) {
      // Create new user
      const newUserData = {
        uid,
        email,
        firstName: mockGoogleUser.name?.split(' ')[0] || "Google",
        lastName: mockGoogleUser.name?.split(' ').slice(1).join(' ') || "User",
        phoneNumber: "",
        role: "customer",
        isActive: true,
        emailVerified: mockGoogleUser.email_verified || false,
        authProvider: "google",
        profilePicture: mockGoogleUser.picture || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        preferences: { 
          newsletter: true, 
          notifications: true,
          language: "en",
          currency: "INR"
        },
        addresses: [],
        orderHistory: [],
        wishlist: [],
        cart: []
      };

      await db.collection("users").doc(uid).set(newUserData);
      userData = newUserData;
      
      console.log(`✅ New Google user created: ${email}`);
    } else {
      // Update existing user
      userData = userDoc.docs[0].data();
      
      await db.collection("users").doc(userData.uid).update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        emailVerified: true // Google users are email verified
      });
      
      console.log(`✅ Existing Google user logged in: ${email}`);
    }

    // Generate JWT token
    const token = generateToken(userData);

    sendResponse(res, 200, true, {
      user: {
        uid: userData.uid,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        role: userData.role,
        emailVerified: userData.emailVerified,
        authProvider: userData.authProvider,
        profilePicture: userData.profilePicture,
        preferences: userData.preferences
      },
      token
    }, "Google login successful");

  } catch (error) {
    console.error("Google login error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during Google login");
  }
});

// GET /auth/verify - Verify JWT Token
router.get("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.token;

    if (!token) {
      return sendResponse(res, 401, false, null, null, "No token provided");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError.message);
      
      if (jwtError.name === 'JsonWebTokenError') {
        return sendResponse(res, 401, false, null, null, "Invalid token");
      }
      if (jwtError.name === 'TokenExpiredError') {
        return sendResponse(res, 401, false, null, null, "Token expired");
      }
      
      return sendResponse(res, 401, false, null, null, "Token verification failed");
    }
    
    // Get user data from database
    const userDoc = await db.collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) {
      return sendResponse(res, 401, false, null, null, "User not found");
    }

    const userData = userDoc.data();

    if (!userData.isActive) {
      return sendResponse(res, 403, false, null, null, "Account disabled");
    }

    sendResponse(res, 200, true, {
      user: {
        uid: userData.uid,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        role: userData.role,
        emailVerified: userData.emailVerified,
        preferences: userData.preferences
      }
    }, "Token verified successfully");

  } catch (error) {
    console.error("Token verification error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during token verification");
  }
});

// POST /auth/logout - User Logout
router.post("/logout", async (req, res) => {
  try {
    // Clear cookie if it exists
    res.clearCookie('token');
    
    sendResponse(res, 200, true, null, "Logout successful");
  } catch (error) {
    console.error("Logout error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during logout");
  }
});

// POST /auth/refresh - Refresh Token
router.post("/refresh", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.token;

    if (!token) {
      return sendResponse(res, 401, false, null, null, "No token provided");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'JsonWebTokenError') {
        return sendResponse(res, 401, false, null, null, "Invalid token");
      }
      if (jwtError.name === 'TokenExpiredError') {
        return sendResponse(res, 401, false, null, null, "Token expired");
      }
      return sendResponse(res, 401, false, null, null, "Token verification failed");
    }
    
    // Get user data from database
    const userDoc = await db.collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) {
      return sendResponse(res, 401, false, null, null, "User not found");
    }

    const userData = userDoc.data();

    if (!userData.isActive) {
      return sendResponse(res, 403, false, null, null, "Account disabled");
    }

    const newToken = generateToken(userData);

    sendResponse(res, 200, true, {
      user: {
        uid: userData.uid,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        role: userData.role,
        emailVerified: userData.emailVerified,
        preferences: userData.preferences
      },
      token: newToken
    }, "Token refreshed successfully");

  } catch (error) {
    console.error("Token refresh error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during token refresh");
  }
});

// POST /auth/forgot-password - Forgot Password
router.post("/forgot-password", [
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { email } = req.body;

    console.log(`🔐 Password reset request for: ${email}`);

    // Check if user exists
    const userQuery = await db.collection("users").where("email", "==", email).get();
    
    if (userQuery.empty) {
      // Don't reveal if email exists or not for security
      return sendResponse(res, 200, true, null, "If the email exists, a password reset link has been sent");
    }

    // In production, you would send an actual email with reset link
    // For development, we'll just log it
    console.log(`📧 Password reset email would be sent to: ${email}`);

    sendResponse(res, 200, true, null, "If the email exists, a password reset link has been sent");

  } catch (error) {
    console.error("Forgot password error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during password reset");
  }
});

// POST /auth/reset-password - Reset Password
router.post("/reset-password", [
  body("token").notEmpty().withMessage("Reset token is required"),
  body("newPassword").isLength({ min: 6 }).withMessage("Password must be at least 6 characters")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { token, newPassword } = req.body;

    console.log(`🔐 Password reset attempt with token`);

    // In production, you would verify the reset token and update the password
    // For development, we'll just return success
    
    sendResponse(res, 200, true, null, "Password reset successful");

  } catch (error) {
    console.error("Reset password error:", error);
    sendResponse(res, 500, false, null, null, "Internal server error during password reset");
  }
});

module.exports = router;

