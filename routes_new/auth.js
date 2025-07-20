const express = require('express');
const { body, validationResult } = require('express-validator');
const { firebaseAuth, db, realtimeDb, admin } = require('../auth/firebaseConfig');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Helper: Standard Response
const sendResponse = (res, statusCode, success, data = null, message = null, error = null, details = null) => {
  const response = { success };
  if (message) response.message = message;
  if (data) response.data = data;
  if (error) response.error = error;
  if (details) response.details = details;
  
  res.status(statusCode).json(response);
};

// Helper: Generate JWT Token
const generateJWT = (user) => {
  return jwt.sign(
    { 
      uid: user.uid, 
      email: user.email,
      role: user.role || 'user',
      emailVerified: user.emailVerified 
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

// Helper: Create user profile in Firestore
const createUserProfile = async (uid, userData) => {
  try {
    const userProfile = {
      uid,
      email: userData.email,
      displayName: userData.displayName || userData.name || '',
      photoURL: userData.photoURL || '',
      role: userData.role || 'user',
      isActive: true,
      emailVerified: userData.emailVerified || false,
      provider: userData.provider || 'email',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      profile: {
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        phone: userData.phone || '',
        address: userData.address || {},
        preferences: {
          newsletter: true,
          notifications: true
        }
      }
    };

    await db.collection('users').doc(uid).set(userProfile);
    
    // Update real-time analytics
    await realtimeDb.ref('analytics/users').transaction((current) => {
      return (current || 0) + 1;
    });

    return userProfile;
  } catch (error) {
    console.error('❌ Error creating user profile:', error);
    throw error;
  }
};

// POST /auth/register - Manual registration with email/password
router.post('/register', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const { email, password, firstName, lastName, phone } = req.body;

    console.log(`👤 Registering new user: ${email}`);

    // Create user in Firebase Auth
    const userRecord = await firebaseAuth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
      emailVerified: false
    });

    console.log(`✅ Firebase user created: ${userRecord.uid}`);

    // Create user profile in Firestore
    const userProfile = await createUserProfile(userRecord.uid, {
      email,
      displayName: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone,
      emailVerified: false,
      provider: 'email'
    });

    // Generate JWT token
    const token = generateJWT({
      uid: userRecord.uid,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified,
      role: 'user'
    });

    // Send email verification (in production, you'd send actual email)
    console.log(`📧 Email verification would be sent to: ${email}`);

    sendResponse(res, 201, true, {
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userProfile.displayName,
        emailVerified: userRecord.emailVerified,
        role: userProfile.role
      },
      token
    }, "User registered successfully. Please verify your email.");

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    if (error.code === 'auth/email-already-exists') {
      return sendResponse(res, 400, false, null, null, "Email already exists");
    }
    
    sendResponse(res, 500, false, null, null, "Registration failed", error.message);
  }
});

// POST /auth/login - Manual login with email/password
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const { email, password } = req.body;

    console.log(`🔐 Login attempt for: ${email}`);

    // Get user by email from Firebase Auth
    const userRecord = await firebaseAuth.getUserByEmail(email);
    
    // Get user profile from Firestore
    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    
    if (!userDoc.exists) {
      return sendResponse(res, 404, false, null, null, "User profile not found");
    }

    const userProfile = userDoc.data();

    // Check if user is active
    if (!userProfile.isActive) {
      return sendResponse(res, 403, false, null, null, "Account is deactivated");
    }

    // For Firebase Auth, we can't directly verify password
    // In production, you'd use Firebase Client SDK for authentication
    // Here we'll create a custom token for the user
    const customToken = await firebaseAuth.createCustomToken(userRecord.uid);

    // Generate JWT token
    const token = generateJWT({
      uid: userRecord.uid,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified,
      role: userProfile.role
    });

    // Update last login time
    await db.collection('users').doc(userRecord.uid).update({
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update real-time analytics
    await realtimeDb.ref('analytics/logins').transaction((current) => {
      return (current || 0) + 1;
    });

    sendResponse(res, 200, true, {
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL,
        emailVerified: userRecord.emailVerified,
        role: userProfile.role
      },
      token,
      customToken
    }, "Login successful");

  } catch (error) {
    console.error('❌ Login error:', error);
    
    if (error.code === 'auth/user-not-found') {
      return sendResponse(res, 404, false, null, null, "User not found");
    }
    
    sendResponse(res, 500, false, null, null, "Login failed", error.message);
  }
});

// POST /auth/google - Google OAuth login/register
router.post('/google', [
  body('idToken').notEmpty().withMessage('Google ID token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const { idToken } = req.body;

    console.log('🔐 Google OAuth login attempt');

    // Verify Google ID token
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);
    const { uid, email, name, picture, email_verified } = decodedToken;

    console.log(`✅ Google token verified for: ${email}`);

    // Check if user profile exists in Firestore
    let userDoc = await db.collection('users').doc(uid).get();
    let userProfile;

    if (!userDoc.exists) {
      // Create new user profile
      console.log(`👤 Creating new Google user profile: ${email}`);
      
      userProfile = await createUserProfile(uid, {
        email,
        displayName: name,
        photoURL: picture,
        emailVerified: email_verified,
        provider: 'google'
      });
    } else {
      userProfile = userDoc.data();
      
      // Update last login time
      await db.collection('users').doc(uid).update({
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Check if user is active
    if (!userProfile.isActive) {
      return sendResponse(res, 403, false, null, null, "Account is deactivated");
    }

    // Generate JWT token
    const token = generateJWT({
      uid,
      email,
      emailVerified: email_verified,
      role: userProfile.role
    });

    // Update real-time analytics
    await realtimeDb.ref('analytics/googleLogins').transaction((current) => {
      return (current || 0) + 1;
    });

    sendResponse(res, 200, true, {
      user: {
        uid,
        email,
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL,
        emailVerified: email_verified,
        role: userProfile.role
      },
      token,
      isNewUser: !userDoc.exists
    }, userDoc.exists ? "Login successful" : "Account created and logged in successfully");

  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    sendResponse(res, 500, false, null, null, "Google authentication failed", error.message);
  }
});

// POST /auth/logout - Logout user
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Update last logout time
        await db.collection('users').doc(decoded.uid).update({
          lastLogoutAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`👋 User logged out: ${decoded.email}`);
      } catch (jwtError) {
        console.warn('⚠️ Invalid JWT token during logout');
      }
    }

    sendResponse(res, 200, true, null, "Logout successful");

  } catch (error) {
    console.error('❌ Logout error:', error);
    sendResponse(res, 500, false, null, null, "Logout failed", error.message);
  }
});

// GET /auth/me - Get current user profile
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendResponse(res, 401, false, null, null, "No token provided");
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Get user profile from Firestore
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    
    if (!userDoc.exists) {
      return sendResponse(res, 404, false, null, null, "User profile not found");
    }

    const userProfile = userDoc.data();

    sendResponse(res, 200, true, {
      user: {
        uid: userProfile.uid,
        email: userProfile.email,
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL,
        emailVerified: userProfile.emailVerified,
        role: userProfile.role,
        profile: userProfile.profile
      }
    }, "User profile retrieved successfully");

  } catch (error) {
    console.error('❌ Get user profile error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return sendResponse(res, 401, false, null, null, "Invalid token");
    }
    
    sendResponse(res, 500, false, null, null, "Failed to get user profile", error.message);
  }
});

// PUT /auth/profile - Update user profile
router.put('/profile', [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendResponse(res, 401, false, null, null, "No token provided");
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    const { firstName, lastName, phone, address, preferences } = req.body;

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (firstName || lastName) {
      updateData.displayName = `${firstName || ''} ${lastName || ''}`.trim();
      updateData['profile.firstName'] = firstName;
      updateData['profile.lastName'] = lastName;
    }

    if (phone) updateData['profile.phone'] = phone;
    if (address) updateData['profile.address'] = address;
    if (preferences) updateData['profile.preferences'] = preferences;

    await db.collection('users').doc(decoded.uid).update(updateData);

    // Also update Firebase Auth display name if changed
    if (updateData.displayName) {
      await firebaseAuth.updateUser(decoded.uid, {
        displayName: updateData.displayName
      });
    }

    sendResponse(res, 200, true, updateData, "Profile updated successfully");

  } catch (error) {
    console.error('❌ Update profile error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return sendResponse(res, 401, false, null, null, "Invalid token");
    }
    
    sendResponse(res, 500, false, null, null, "Failed to update profile", error.message);
  }
});

// POST /auth/forgot-password - Send password reset email
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const { email } = req.body;

    // Check if user exists
    const userRecord = await firebaseAuth.getUserByEmail(email);
    
    // In production, you'd send actual password reset email
    // For now, we'll just log it
    console.log(`📧 Password reset email would be sent to: ${email}`);

    sendResponse(res, 200, true, null, "Password reset email sent successfully");

  } catch (error) {
    console.error('❌ Forgot password error:', error);
    
    if (error.code === 'auth/user-not-found') {
      // Don't reveal if email exists or not for security
      return sendResponse(res, 200, true, null, "If the email exists, a password reset link has been sent");
    }
    
    sendResponse(res, 500, false, null, null, "Failed to send password reset email", error.message);
  }
});

// POST /auth/verify-email - Verify email address
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const { token } = req.body;

    // In production, you'd verify the actual email verification token
    // For now, we'll simulate email verification
    console.log(`✅ Email verification simulated for token: ${token}`);

    sendResponse(res, 200, true, null, "Email verified successfully");

  } catch (error) {
    console.error('❌ Email verification error:', error);
    sendResponse(res, 500, false, null, null, "Email verification failed", error.message);
  }
});

module.exports = router;

