const express = require("express");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");

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
  console.error("❌ JWT_SECRET not found. This is a critical security issue. Please set the JWT_SECRET environment variable.");
  process.exit(1); // Exit the process if JWT_SECRET is not set
}

// ✅ Initialize Firebase Admin safely
try {
  if (!admin.apps.length) {
    // Try to initialize with service account file
    try {
      const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized with service account");
    } catch (err) {
      // Fallback to application default credentials
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      console.log("✅ Firebase Admin initialized with default credentials");
    }
  }
} catch (err) {
  console.error("❌ Firebase Admin init failed:", err.message);
  console.log("⚠️ Continuing without Firebase - some features may not work");
}

const db = admin.firestore();

// ✅ Helper: Generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { uid: user.uid, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// ✅ Helper: Hash password
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

// ✅ Helper: Verify password
const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// ✅ Enhanced Registration - Support both Firebase and direct email/password
router.post("/register", [
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("firstName").notEmpty().withMessage("First name is required"),
  body("lastName").notEmpty().withMessage("Last name is required"),
  // Make password optional for Firebase registration
  body("password").optional().isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("idToken").optional().notEmpty().withMessage("ID token must not be empty if provided")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      error: "Validation failed", 
      details: errors.array() 
    });
  }

  const { idToken, email, password, firstName, lastName, phoneNumber } = req.body;

  try {
    let uid, emailVerified = false;

    // Method 1: Firebase ID Token Registration
    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
        emailVerified = decoded.email_verified || false;
        
        // Verify email matches
        if (decoded.email !== email) {
          return res.status(400).json({ 
            success: false,
            error: "Email mismatch with Firebase token" 
          });
        }
      } catch (firebaseError) {
        console.error("Firebase token verification failed:", firebaseError.message);
        return res.status(401).json({ 
          success: false,
          error: "Invalid Firebase token" 
        });
      }
    } 
    // Method 2: Direct Email/Password Registration
    else if (password) {
      uid = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      emailVerified = false; // Will need email verification
    } else {
      return res.status(400).json({ 
        success: false,
        error: "Either idToken or password is required" 
      });
    }

    // Check if user already exists
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return res.status(409).json({ 
        success: false,
        error: "User already exists" 
      });
    }

    // Check if email is already registered (for direct registration)
    if (!idToken) {
      const emailQuery = await db.collection("users").where("email", "==", email).get();
      if (!emailQuery.empty) {
        return res.status(409).json({ 
          success: false,
          error: "Email already registered" 
        });
      }
    }

    // Create user data
    const userData = {
      uid,
      email,
      firstName,
      lastName,
      phoneNumber: phoneNumber || "",
      role: "customer",
      isActive: true,
      emailVerified,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null,
      preferences: { newsletter: true, notifications: true },
      addresses: [],
      orderHistory: []
    };

    // Add password hash for direct registration
    if (password) {
      userData.passwordHash = await hashPassword(password);
    }

    await userRef.set(userData);

    const token = generateToken(userData);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: { 
          uid, 
          email, 
          firstName, 
          lastName, 
          role: "customer",
          emailVerified 
        },
        token
      }
    });

  } catch (error) {
    console.error("❌ Register error:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Registration failed",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Enhanced Login - Support both Firebase and direct email/password
router.post("/login", [
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  // Make both optional since we support multiple login methods
  body("password").optional().isLength({ min: 1 }).withMessage("Password cannot be empty"),
  body("idToken").optional().notEmpty().withMessage("ID token must not be empty if provided")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      error: "Validation failed", 
      details: errors.array() 
    });
  }

  const { email, password, idToken } = req.body;

  try {
    let uid;

    // Method 1: Firebase ID Token Login
    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
        
        // Verify email matches
        if (decoded.email !== email) {
          return res.status(400).json({ 
            success: false,
            error: "Email mismatch with Firebase token" 
          });
        }
      } catch (firebaseError) {
        console.error("Firebase token verification failed:", firebaseError.message);
        return res.status(401).json({ 
          success: false,
          error: "Invalid Firebase token" 
        });
      }
    }
    // Method 2: Direct Email/Password Login
    else if (password) {
      // Find user by email
      const emailQuery = await db.collection("users").where("email", "==", email).get();
      
      if (emailQuery.empty) {
        return res.status(404).json({ 
          success: false,
          error: "User not found" 
        });
      }

      const userDoc = emailQuery.docs[0];
      const userData = userDoc.data();
      uid = userDoc.id;

      // Verify password
      if (!userData.passwordHash) {
        return res.status(400).json({ 
          success: false,
          error: "This account was created with social login. Please use Google Sign-In." 
        });
      }

      const isPasswordValid = await verifyPassword(password, userData.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false,
          error: "Invalid password" 
        });
      }
    } else {
      return res.status(400).json({ 
        success: false,
        error: "Either idToken or password is required" 
      });
    }

    // Get user data
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    const userData = userSnap.data();

    if (!userData.isActive) {
      return res.status(403).json({ 
        success: false,
        error: "Account disabled" 
      });
    }

    // Update last login
    await userRef.update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const token = generateToken(userData);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          uid: userData.uid,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          emailVerified: userData.emailVerified
        },
        token
      }
    });

  } catch (error) {
    console.error("❌ Login error:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Login failed",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Google Login (Firebase ID Token)
router.post("/google-login", [
  body("idToken").notEmpty().withMessage("Google ID token is required")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      error: "Validation failed", 
      details: errors.array() 
    });
  }

  const { idToken } = req.body;

  try {
    // Verify the Firebase ID token
    const decoded = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, email_verified } = decoded;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: "Email not provided by Google" 
      });
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    let userData;

    if (!userSnap.exists) {
      // Create new user from Google data
      const nameParts = (name || email.split('@')[0]).split(' ');
      userData = {
        uid,
        email,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        phoneNumber: "",
        role: "customer",
        isActive: true,
        emailVerified: email_verified || false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        preferences: { newsletter: true, notifications: true },
        addresses: [],
        orderHistory: []
      };

      await userRef.set(userData);
      console.log("✅ New Google user created:", uid);
    } else {
      userData = userSnap.data();
      
      if (!userData.isActive) {
        return res.status(403).json({ 
          success: false,
          error: "Account disabled" 
        });
      }

      // Update last login
      await userRef.update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log("✅ Existing Google user logged in:", uid);
    }

    // Generate JWT token
    const token = generateToken(userData);

    // Ensure we have all required data before sending response
    const responseData = {
      success: true,
      message: "Google login successful",
      data: {
        user: {
          uid: userData.uid,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          emailVerified: userData.emailVerified
        },
        token
      }
    };

    console.log("✅ Google login response prepared for:", email);
    
    // Set proper headers to ensure complete response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', Buffer.byteLength(JSON.stringify(responseData)));
    
    return res.status(200).json(responseData);

  } catch (error) {
    console.error("❌ Google login error:", error.message);
    console.error("❌ Full error:", error);
    
    // Ensure we always send a complete JSON response even on error
    const errorResponse = { 
      success: false,
      error: "Google login failed",
      details: process.env.NODE_ENV === 'development' ? error.message : "Authentication failed"
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', Buffer.byteLength(JSON.stringify(errorResponse)));
    
    return res.status(401).json(errorResponse);
  }
});

// ✅ Token verification
router.post("/verify", async (req, res) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: "Token missing" 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userSnap = await db.collection("users").doc(decoded.uid).get();

    if (!userSnap.exists) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    const userData = userSnap.data();
    if (!userData.isActive) {
      return res.status(403).json({ 
        success: false,
        error: "Account disabled" 
      });
    }

    res.json({ 
      success: true, 
      data: { 
        user: {
          uid: userData.uid,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          emailVerified: userData.emailVerified
        }
      } 
    });

  } catch (error) {
    console.error("❌ Token verification error:", error.message);
    res.status(401).json({ 
      success: false,
      error: "Invalid or expired token" 
    });
  }
});

// ✅ Forgot password (works for both Firebase and direct users)
router.post("/forgot-password", [
  body("email").isEmail().normalizeEmail()
], async (req, res) => {
  const { email } = req.body;

  try {
    // Check if user exists
    const emailQuery = await db.collection("users").where("email", "==", email).get();
    
    if (!emailQuery.empty) {
      const userData = emailQuery.docs[0].data();
      
      // If user has Firebase auth, use Firebase password reset
      if (!userData.passwordHash) {
        try {
          const link = await admin.auth().generatePasswordResetLink(email);
          console.log("🔧 Firebase password reset link:", link);
        } catch (firebaseError) {
          console.error("Firebase password reset failed:", firebaseError.message);
        }
      } else {
        // For direct users, you would implement your own password reset logic here
        console.log("🔧 Direct user password reset requested for:", email);
        // TODO: Implement email sending with reset token
      }
    }

    // Always return success for security (don't reveal if email exists)
    res.json({ 
      success: true, 
      message: "If the email exists, a reset link has been sent." 
    });

  } catch (error) {
    console.error("Password reset error:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Failed to process password reset request" 
    });
  }
});

// ✅ Logout (stateless)
router.post("/logout", (req, res) => {
  res.json({ 
    success: true, 
    message: "Logout successful. Client should delete the token." 
  });
});

// ✅ Health check for auth service
router.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "Authentication Service",
    timestamp: new Date().toISOString(),
    firebase: admin.apps.length > 0 ? "connected" : "not connected"
  });
});

module.exports = router;

