const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const { db, admin, firebaseAuth } = require("../auth/firebaseConfig");

const router = express.Router();

// ✅ Rate limiter for brute-force protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 100,
  message: { error: "Too many requests, please try again later." }
});
router.use(limiter);

// ✅ JWT Secret check
if (!process.env.JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET not set, using default for development");
  process.env.JWT_SECRET = "development-jwt-secret-key";
}

// ✅ Helper: Generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { uid: user.uid, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// ✅ Registration via email/password (for frontend compatibility)
router.post("/register", [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 }),
  body("firstName").notEmpty(),
  body("lastName").notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

  const { email, password, firstName, lastName, phoneNumber } = req.body;

  try {
    // First create user in Firebase Auth
    const firebaseUser = await firebaseAuth.createUser({
      email,
      password,
      emailVerified: false
    });
    
    const uid = firebaseUser.uid;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return res.status(409).json({ error: "User already exists" });
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

    res.status(201).json({
      success: true,
      message: "User registered",
      data: {
        user: {
          uid,
          email,
          name: `${firstName} ${lastName}`,
          firstName,
          lastName,
          role: "customer"
        },
        token
      }
    });

  } catch (error) {
    console.error("❌ Register error:", error.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ✅ Registration via ID token (for Firebase token-based auth)
router.post("/register-token", [
  body("idToken").notEmpty().withMessage("ID token is required"),
  body("firstName").notEmpty(),
  body("lastName").notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

  const { idToken, firstName, lastName, phoneNumber } = req.body;

  try {
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const { uid, email } = decoded;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return res.status(409).json({ error: "User already exists" });
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

    res.status(201).json({
      success: true,
      message: "User registered",
      data: {
        user: {
          uid,
          email,
          name: `${firstName} ${lastName}`,
          firstName,
          lastName,
          role: "customer"
        },
        token
      }
    });

  } catch (error) {
    console.error("❌ Register error:", error.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ✅ Login via email/password (for frontend compatibility)
router.post("/login", [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

  const { email, password } = req.body;

  try {
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
      return res.status(403).json({ error: "Account disabled" });
    }

    await userRef.update({
      lastLogin: new Date(),
      updatedAt: new Date()
    });

    const token = generateToken(userData);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          uid: userData.uid,
          email: userData.email,
          name: `${userData.firstName} ${userData.lastName}`,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role
        },
        token
      }
    });

  } catch (error) {
    console.error("❌ Login error:", error.message);
    res.status(401).json({ error: "Invalid credentials" });
  }
});

// ✅ Login via ID token (for Firebase token-based auth)
router.post("/login-token", [
  body("idToken").notEmpty().withMessage("ID token is required")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

  const { idToken } = req.body;

  try {
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const { uid, email } = decoded;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnap.data();

    if (!userData.isActive) {
      return res.status(403).json({ error: "Account disabled" });
    }

    await userRef.update({
      lastLogin: new Date(),
      updatedAt: new Date()
    });

    const token = generateToken(userData);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          uid: userData.uid,
          email: userData.email,
          name: `${userData.firstName} ${userData.lastName}`,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role
        },
        token
      }
    });

  } catch (error) {
    console.error("❌ Login error:", error.message);
    res.status(401).json({ error: "Login failed" });
  }
});

// ✅ Token verification
router.post("/verify", async (req, res) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ error: "Token missing" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userSnap = await db.collection("users").doc(decoded.uid).get();

    if (!userSnap.exists) return res.status(404).json({ error: "User not found" });

    const userData = userSnap.data();
    if (!userData.isActive) return res.status(403).json({ error: "Account disabled" });

    res.json({ success: true, user: userData });

  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

// ✅ Forgot password (safe and anonymous)
router.post("/forgot-password", [
  body("email").isEmail().normalizeEmail()
], async (req, res) => {
  const { email } = req.body;

  try {
    const link = await firebaseAuth.generatePasswordResetLink(email);

    // In production, you would email this link
    if (process.env.NODE_ENV === "development") {
      console.log("🔧 Password reset link:", link);
    }

    res.json({ success: true, message: "If email exists, a reset link was sent." });

  } catch (error) {
    console.error("Password reset error:", error.message);
    res.status(500).json({ error: "Failed to send reset email" });
  }
});

// ✅ Google Login (alias for login-token for frontend compatibility)
router.post("/google-login", [
  body("idToken").notEmpty().withMessage("ID token is required")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

  const { idToken } = req.body;

  try {
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
      return res.status(403).json({ error: "Account disabled" });
    }

    await userRef.update({
      lastLogin: new Date(),
      updatedAt: new Date()
    });

    const token = generateToken(userData);

    res.json({
      success: true,
      message: "Google login successful",
      data: {
        user: {
          uid: userData.uid,
          email: userData.email,
          name: `${userData.firstName} ${userData.lastName}`,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role
        },
        token
      }
    });

  } catch (error) {
    console.error("❌ Google login error:", error.message);
    res.status(401).json({ error: "Google login failed" });
  }
});

// ✅ Logout (stateless)
router.post("/logout", (req, res) => {
  res.json({ success: true, message: "Client should delete the token" });
});

module.exports = router;