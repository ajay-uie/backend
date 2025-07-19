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