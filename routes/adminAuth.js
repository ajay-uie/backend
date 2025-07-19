const express = require("express");
const router = express.Router();
const { auth, db, admin } = require("../auth/firebaseConfig");
const jwt = require("jsonwebtoken");

// Admin login function
const adminLogin = async (email, password) => {
  try {
    let userDoc = null;
    let userProfile = null;
    
    try {
      const usersQuery = await db.collection("users").where("email", "==", email).get();
      if (!usersQuery.empty) {
        userDoc = usersQuery.docs[0];
        userProfile = userDoc.data();
      }
    } catch (error) {
      console.error("Database query error:", error);
      return { 
        success: false, 
        message: "Database error", 
        error: error.message, 
        statusCode: 500 
      };
    }
    
    if (!userDoc || !userProfile) {
      return { 
        success: false, 
        message: "Invalid admin credentials", 
        error: "Admin not found", 
        statusCode: 401 
      };
    }

    if (userProfile.role !== "admin") {
      return { 
        success: false, 
        message: "Access denied", 
        error: "Admin access required", 
        statusCode: 403 
      };
    }

    if (!userProfile.isActive) {
      return { 
        success: false, 
        message: "Admin account deactivated", 
        error: "Your admin account has been deactivated. Please contact support.", 
        statusCode: 403 
      };
    }

    const expectedPassword = "Admin@ajay#9196";
    if (password !== expectedPassword) {
      return { 
        success: false, 
        message: "Invalid admin credentials", 
        error: "Invalid password", 
        statusCode: 401 
      };
    }

    try {
      await db.collection("users").doc(userDoc.id).update({
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to update user login time:", error);
    }

    try {
      await db.collection("admin_activity").add({
        adminId: userDoc.id,
        activity: "admin_login",
        ip: "127.0.0.1",
        userAgent: "Admin-Panel",
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to log admin activity:", error);
    }

    const jwtSecret = process.env.JWT_SECRET || "fallback-admin-secret-key";
    const token = jwt.sign(
      { 
        uid: userDoc.id,
        email: userProfile.email,
        role: userProfile.role,
        type: "admin"
      },
      jwtSecret,
      { expiresIn: "24h" } 
    );

    const adminData = {
      uid: userDoc.id,
      email: userProfile.email,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      role: userProfile.role,
      emailVerified: true, 
      lastLoginAt: new Date().toISOString(),
      permissions: userProfile.permissions || {
        manageProducts: true,
        manageOrders: true,
        manageUsers: true,
        manageCoupons: true,
        viewAnalytics: true,
        manageSettings: true
      }
    };

    return {
      success: true,
      message: "Admin login successful",
      admin: adminData,
      token: token,
      statusCode: 200
    };

  } catch (error) {
    console.error("Admin login error:", error);
    return { 
      success: false, 
      message: "Admin login failed", 
      error: error.message, 
      statusCode: 500 
    };
  }
};

const verifyAdminToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authorization header is required"
      });
    }

    const token = authHeader.split("Bearer ")[1];
    let decodedToken;

    try {
      const jwtSecret = process.env.JWT_SECRET || "fallback-admin-secret-key";
      decodedToken = jwt.verify(token, jwtSecret);
    } catch (jwtError) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired token"
      });
    }

    if (decodedToken.type !== "admin") {
      return res.status(403).json({
        error: "Access denied",
        message: "Admin token required"
      });
    }

    let userData = {
      role: "admin",
      isActive: true,
      permissions: {
        manageProducts: true,
        manageOrders: true,
        manageUsers: true,
        manageCoupons: true,
        viewAnalytics: true,
        manageSettings: true
      }
    };

    try {
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      if (userDoc.exists) {
        userData = userDoc.data();
      }
    } catch (error) {
      console.error("Failed to fetch user data:", error);
    }

    if (!userData || userData.role !== "admin") {
      return res.status(403).json({
        error: "Access denied",
        message: "Admin access required"
      });
    }

    if (!userData.isActive) {
      return res.status(403).json({
        error: "Account deactivated",
        message: "Admin account has been deactivated"
      });
    }

    req.admin = { 
      ...decodedToken, 
      permissions: userData.permissions || {
        manageProducts: true,
        manageOrders: true,
        manageUsers: true,
        manageCoupons: true,
        viewAnalytics: true,
        manageSettings: true
      }
    };
    
    next();
  } catch (error) {
    console.error("Admin token verification error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message
    });
  }
};

const checkAdminPermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Admin authentication required"
      });
    }

    if (!req.admin.permissions || !req.admin.permissions[permission]) {
      return res.status(403).json({
        error: "Permission denied",
        message: `Admin permission \'${permission}\' required`
      });
    }

    next();
  };
};

const adminLogout = async (adminId) => {
  try {
    try {
      await db.collection("admin_activity").add({
        adminId: adminId,
        activity: "admin_logout",
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to log admin logout activity:", error);
    }

    return {
      success: true,
      message: "Admin logout successful",
      statusCode: 200
    };
  } catch (error) {
    console.error("Admin logout error:", error);
    return {
      success: false,
      message: "Admin logout failed",
      error: error.message,
      statusCode: 500
    };
  }
};

const getAdminProfile = async (adminId) => {
  try {
    let userData = {
      uid: adminId,
      email: "admin@fragransia.in",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      permissions: {
        manageProducts: true,
        manageOrders: true,
        manageUsers: true,
        manageCoupons: true,
        viewAnalytics: true,
        manageSettings: true
      }
    };

    try {
      const userDoc = await db.collection("users").doc(adminId).get();
      if (userDoc.exists) {
        userData = { ...userData, ...userDoc.data() };
      }
    } catch (error) {
      console.error("Failed to fetch admin profile:", error);
    }
    
    if (userData.role !== "admin") {
      return {
        success: false,
        message: "Not an admin account",
        statusCode: 403
      };
    }

    const adminData = {
      uid: adminId,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      permissions: userData.permissions,
      lastLoginAt: userData.lastLoginAt?.toDate ? userData.lastLoginAt.toDate() : new Date(),
      createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate() : new Date()
    };

    return {
      success: true,
      admin: adminData,
      statusCode: 200
    };
  } catch (error) {
    console.error("Get admin profile error:", error);
    return {
      success: false,
      message: "Failed to get admin profile",
      error: error.message,
      statusCode: 500
    };
  }
};

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const result = await adminLogin(email, password);
  
  if (result.success) {
    res.status(result.statusCode).json({
      success: true,
      message: result.message,
      data: {
        admin: result.admin,
        token: result.token
      }
    });
  } else {
    res.status(result.statusCode).json({
      success: false,
      error: result.message,
      details: result.error
    });
  }
});

router.get("/profile", verifyAdminToken, async (req, res) => {
  const result = await getAdminProfile(req.admin.uid);
  
  if (result.success) {
    res.status(result.statusCode).json({
      success: true,
      data: {
        admin: result.admin
      }
    });
  } else {
    res.status(result.statusCode).json({
      success: false,
      error: result.message,
      details: result.error
    });
  }
});

router.post("/logout", verifyAdminToken, async (req, res) => {
  const result = await adminLogout(req.admin.uid);
  
  if (result.success) {
    res.status(result.statusCode).json({
      success: true,
      message: result.message
    });
  } else {
    res.status(result.statusCode).json({
      success: false,
      error: result.message,
      details: result.error
    });
  }
});

module.exports = router;

