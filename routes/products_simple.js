const express = require('express');
const router = express.Router();
const { db } = require('../auth/firebaseConfig');

// Get all products - simplified version
router.get("/", async (req, res) => {
  try {
    const snapshot = await db.collection("products").get();
    let products = [];

    snapshot.forEach(doc => {
      products.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      });
    });

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalProducts: products.length,
        hasNextPage: false,
        hasPrevPage: false
      },
      filters: {}
    });
  } catch (error) {
    console.error("Products fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products"
    });
  }
});

module.exports = router;

