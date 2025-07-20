const jwt = require('jsonwebtoken');
const { db } = require('../auth/firebaseConfig');

// Helper: Standard Response
const sendResponse = (res, statusCode, success, data = null, message = null, error = null, details = null) => {
  const response = { success };
  if (message) response.message = message;
  if (data) response.data = data;
  if (error) response.error = error;
  if (details) response.details = details;
  
  res.status(statusCode).json(response);
};

// Authentication middleware for regular users
const authMiddleware = async (req, res, next) => {
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

    // Check if user is active
    if (!userProfile.isActive) {
      return sendResponse(res, 403, false, null, null, "Account is deactivated");
    }

    // Add user to request object
    req.user = {
      uid: userProfile.uid,
      email: userProfile.email,
      role: userProfile.role,
      ...userProfile
    };

    next();

  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return sendResponse(res, 401, false, null, null, "Invalid token");
    }
    
    if (error.name === 'TokenExpiredError') {
      return sendResponse(res, 401, false, null, null, "Token expired");
    }
    
    return sendResponse(res, 500, false, null, null, "Authentication failed", error.message);
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Get user profile from Firestore
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    
    if (userDoc.exists) {
      const userProfile = userDoc.data();
      
      if (userProfile.isActive) {
        req.user = {
          uid: userProfile.uid,
          email: userProfile.email,
          role: userProfile.role,
          ...userProfile
        };
      }
    }

    next();

  } catch (error) {
    // If there's an error with the token, just continue without user
    console.warn('⚠️ Optional auth middleware error:', error.message);
    req.user = null;
    next();
  }
};

// Admin authentication middleware
const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendResponse(res, 401, false, null, null, "No admin token provided");
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Check if it's an admin token
    if (decoded.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Admin access required");
    }

    // Get admin profile from Firestore
    const adminDoc = await db.collection('admins').doc(decoded.uid).get();
    
    if (!adminDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Admin profile not found");
    }

    const adminProfile = adminDoc.data();

    // Check if admin is active
    if (!adminProfile.isActive) {
      return sendResponse(res, 403, false, null, null, "Admin account is deactivated");
    }

    // Add admin to request object
    req.admin = {
      uid: adminProfile.uid,
      email: adminProfile.email,
      role: adminProfile.role,
      permissions: adminProfile.permissions,
      ...adminProfile
    };

    next();

  } catch (error) {
    console.error('❌ Admin middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return sendResponse(res, 401, false, null, null, "Invalid admin token");
    }
    
    if (error.name === 'TokenExpiredError') {
      return sendResponse(res, 401, false, null, null, "Admin token expired");
    }
    
    return sendResponse(res, 500, false, null, null, "Admin authentication failed", error.message);
  }
};

// Permission-based middleware
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return sendResponse(res, 401, false, null, null, "Admin authentication required");
    }

    if (!req.admin.permissions || !req.admin.permissions[permission]) {
      return sendResponse(res, 403, false, null, null, `Permission '${permission}' required`);
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  adminMiddleware,
  requirePermission
};

