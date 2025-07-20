const jwt = require('jsonwebtoken');
const { db } = require('../auth/firebaseConfig');

// JWT Secret validation
if (!process.env.JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET not set, using default for development");
  process.env.JWT_SECRET = "development-jwt-secret-key";
}

const verifyAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access token required"
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user data from database
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    const userData = userDoc.data();
    
    if (!userData.isActive) {
      return res.status(403).json({
        success: false,
        error: "Account disabled"
      });
    }

    // Attach user data to request
    req.user = {
      uid: userData.uid,
      email: userData.email,
      role: userData.role,
      firstName: userData.firstName,
      lastName: userData.lastName
    };

    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: "Invalid token"
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: "Token expired"
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "Authentication failed"
      });
    }
  }
};

module.exports = verifyAuth;

