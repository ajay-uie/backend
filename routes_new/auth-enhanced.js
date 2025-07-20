const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../auth/firebaseConfig');
const verifyAuth = require('../middleware/authMiddleware');

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

// POST /api/auth-enhanced/social - Social login
router.post('/social', [
  body('provider').isIn(['google', 'facebook', 'apple']).withMessage('Valid social provider is required'),
  body('token').notEmpty().withMessage('Social token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { provider, token, userData } = req.body;

    // Verify the social token based on provider
    let socialUserData;
    
    try {
      switch (provider) {
        case 'google':
          // Verify Google token
          const decodedToken = await admin.auth().verifyIdToken(token);
          socialUserData = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name,
            picture: decodedToken.picture,
            provider: 'google'
          };
          break;
        
        case 'facebook':
          // For Facebook, you would verify the token with Facebook's API
          // This is a placeholder implementation
          socialUserData = {
            uid: userData.id,
            email: userData.email,
            name: userData.name,
            picture: userData.picture?.data?.url,
            provider: 'facebook'
          };
          break;
        
        case 'apple':
          // For Apple, you would verify the token with Apple's API
          // This is a placeholder implementation
          socialUserData = {
            uid: userData.sub,
            email: userData.email,
            name: userData.name,
            provider: 'apple'
          };
          break;
        
        default:
          return sendResponse(res, 400, false, null, null, "Unsupported social provider");
      }
    } catch (tokenError) {
      console.error('Social token verification error:', tokenError);
      return sendResponse(res, 401, false, null, null, "Invalid social token");
    }

    // Check if user already exists
    let userDoc = await db.collection('users').doc(socialUserData.uid).get();
    let userData_final;

    if (userDoc.exists) {
      // Update existing user
      userData_final = userDoc.data();
      await db.collection('users').doc(socialUserData.uid).update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Create new user
      userData_final = {
        uid: socialUserData.uid,
        email: socialUserData.email,
        firstName: socialUserData.name?.split(' ')[0] || '',
        lastName: socialUserData.name?.split(' ').slice(1).join(' ') || '',
        profilePicture: socialUserData.picture || '',
        provider: socialUserData.provider,
        isActive: true,
        role: 'user',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('users').doc(socialUserData.uid).set(userData_final);
    }

    // Generate custom token for the user
    const customToken = await admin.auth().createCustomToken(socialUserData.uid);

    sendResponse(res, 200, true, {
      user: {
        uid: socialUserData.uid,
        email: socialUserData.email,
        firstName: userData_final.firstName,
        lastName: userData_final.lastName,
        profilePicture: userData_final.profilePicture,
        provider: userData_final.provider,
        role: userData_final.role
      },
      token: customToken
    }, "Social login successful");

  } catch (error) {
    console.error('❌ Social login error:', error);
    sendResponse(res, 500, false, null, null, "Social login failed", error.message);
  }
});

// POST /api/auth-enhanced/2fa - Enable/Setup 2FA
router.post('/2fa', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Generate a secret for 2FA
    const secret = require('crypto').randomBytes(20).toString('hex');
    
    // Store the secret temporarily (user needs to verify it first)
    await db.collection('users').doc(userId).update({
      twoFactorSecret: secret,
      twoFactorEnabled: false, // Will be enabled after verification
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Generate QR code data (you would use a library like 'qrcode' in production)
    const qrCodeData = `otpauth://totp/Fragransia:${req.user.email}?secret=${secret}&issuer=Fragransia`;

    sendResponse(res, 200, true, {
      secret,
      qrCodeData,
      backupCodes: [] // Generate backup codes in production
    }, "2FA setup initiated. Please verify with your authenticator app.");

  } catch (error) {
    console.error('❌ 2FA setup error:', error);
    sendResponse(res, 500, false, null, null, "Failed to setup 2FA", error.message);
  }
});

// POST /api/auth-enhanced/verify-2fa - Verify and enable 2FA
router.post('/verify-2fa', verifyAuth, [
  body('code').isLength({ min: 6, max: 6 }).withMessage('Valid 6-digit code is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { code } = req.body;
    const userId = req.user.uid;

    // Get user's 2FA secret
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userDoc.data();
    if (!userData.twoFactorSecret) {
      return sendResponse(res, 400, false, null, null, "2FA not set up. Please setup 2FA first.");
    }

    // Verify the code (in production, use a library like 'speakeasy')
    // This is a simplified verification
    const isValidCode = code === '123456' || code.length === 6; // Placeholder verification

    if (!isValidCode) {
      return sendResponse(res, 400, false, null, null, "Invalid verification code");
    }

    // Enable 2FA for the user
    await db.collection('users').doc(userId).update({
      twoFactorEnabled: true,
      twoFactorVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 200, true, {
      twoFactorEnabled: true
    }, "2FA has been successfully enabled for your account");

  } catch (error) {
    console.error('❌ 2FA verification error:', error);
    sendResponse(res, 500, false, null, null, "Failed to verify 2FA", error.message);
  }
});

// POST /api/auth-enhanced/disable-2fa - Disable 2FA
router.post('/disable-2fa', verifyAuth, [
  body('password').notEmpty().withMessage('Password is required to disable 2FA')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { password } = req.body;
    const userId = req.user.uid;

    // Verify user's password (you would implement proper password verification)
    // This is a placeholder
    if (!password || password.length < 6) {
      return sendResponse(res, 400, false, null, null, "Invalid password");
    }

    // Disable 2FA
    await db.collection('users').doc(userId).update({
      twoFactorEnabled: false,
      twoFactorSecret: admin.firestore.FieldValue.delete(),
      twoFactorDisabledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 200, true, {
      twoFactorEnabled: false
    }, "2FA has been disabled for your account");

  } catch (error) {
    console.error('❌ Disable 2FA error:', error);
    sendResponse(res, 500, false, null, null, "Failed to disable 2FA", error.message);
  }
});

module.exports = router;

