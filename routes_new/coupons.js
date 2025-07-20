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

// POST /api/coupons/apply - Apply coupon to order
router.post('/apply', verifyAuth, [
  body('code').notEmpty().withMessage('Coupon code is required'),
  body('orderTotal').isFloat({ min: 0 }).withMessage('Valid order total is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { code, orderTotal } = req.body;
    const userId = req.user.uid;

    // Get coupon details
    const couponRef = db.collection('coupons').doc(code.toUpperCase());
    const couponDoc = await couponRef.get();

    if (!couponDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Invalid coupon code");
    }

    const coupon = couponDoc.data();

    // Check if coupon is active
    if (!coupon.isActive) {
      return sendResponse(res, 400, false, null, null, "Coupon is no longer active");
    }

    // Check expiry date
    if (new Date() > coupon.expiryDate.toDate()) {
      return sendResponse(res, 400, false, null, null, "Coupon has expired");
    }

    // Check minimum order value
    if (orderTotal < coupon.minOrderValue) {
      return sendResponse(res, 400, false, null, null, `Minimum order value of ₹${coupon.minOrderValue} required`);
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return sendResponse(res, 400, false, null, null, "Coupon usage limit exceeded");
    }

    // Check user-specific usage limit
    if (coupon.userUsageLimit) {
      const userUsageRef = db.collection('couponUsage').doc(`${code}_${userId}`);
      const userUsageDoc = await userUsageRef.get();
      
      if (userUsageDoc.exists && userUsageDoc.data().usageCount >= coupon.userUsageLimit) {
        return sendResponse(res, 400, false, null, null, "You have reached the usage limit for this coupon");
      }
    }

    // Calculate discount
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = Math.round((orderTotal * coupon.discount) / 100);
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = coupon.discount;
    }

    sendResponse(res, 200, true, {
      coupon: {
        code: coupon.code,
        type: coupon.type,
        discount: coupon.discount,
        appliedDiscount: discount,
        description: coupon.description,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount
      }
    }, "Coupon applied successfully");

  } catch (error) {
    console.error('❌ Apply coupon error:', error);
    sendResponse(res, 500, false, null, null, "Failed to apply coupon", error.message);
  }
});

// POST /api/coupons/validate - Validate coupon without applying
router.post('/validate', verifyAuth, [
  body('code').notEmpty().withMessage('Coupon code is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { code } = req.body;
    const userId = req.user.uid;

    const couponRef = db.collection('coupons').doc(code.toUpperCase());
    const couponDoc = await couponRef.get();

    if (!couponDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Invalid coupon code");
    }

    const coupon = couponDoc.data();

    const validationResult = {
      isValid: true,
      reasons: []
    };

    // Check if coupon is active
    if (!coupon.isActive) {
      validationResult.isValid = false;
      validationResult.reasons.push("Coupon is no longer active");
    }

    // Check expiry date
    if (new Date() > coupon.expiryDate.toDate()) {
      validationResult.isValid = false;
      validationResult.reasons.push("Coupon has expired");
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      validationResult.isValid = false;
      validationResult.reasons.push("Coupon usage limit exceeded");
    }

    // Check user-specific usage limit
    if (coupon.userUsageLimit) {
      const userUsageRef = db.collection('couponUsage').doc(`${code}_${userId}`);
      const userUsageDoc = await userUsageRef.get();
      
      if (userUsageDoc.exists && userUsageDoc.data().usageCount >= coupon.userUsageLimit) {
        validationResult.isValid = false;
        validationResult.reasons.push("You have reached the usage limit for this coupon");
      }
    }

    sendResponse(res, 200, true, {
      coupon: {
        code: coupon.code,
        type: coupon.type,
        discount: coupon.discount,
        description: coupon.description,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount,
        expiryDate: coupon.expiryDate.toDate()
      },
      validation: validationResult
    }, "Coupon validation completed");

  } catch (error) {
    console.error('❌ Validate coupon error:', error);
    sendResponse(res, 500, false, null, null, "Failed to validate coupon", error.message);
  }
});

// GET /api/coupons/available - Get available coupons for user
router.get('/available', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { orderTotal } = req.query;

    let query = db.collection('coupons')
      .where('isActive', '==', true)
      .where('expiryDate', '>', new Date());

    const snapshot = await query.get();
    const availableCoupons = [];

    for (const doc of snapshot.docs) {
      const coupon = doc.data();

      // Check usage limits
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        continue;
      }

      // Check user-specific usage limit
      if (coupon.userUsageLimit) {
        const userUsageRef = db.collection('couponUsage').doc(`${coupon.code}_${userId}`);
        const userUsageDoc = await userUsageRef.get();
        
        if (userUsageDoc.exists && userUsageDoc.data().usageCount >= coupon.userUsageLimit) {
          continue;
        }
      }

      // Check if applicable to current order total
      let isApplicable = true;
      if (orderTotal && parseFloat(orderTotal) < coupon.minOrderValue) {
        isApplicable = false;
      }

      availableCoupons.push({
        code: coupon.code,
        type: coupon.type,
        discount: coupon.discount,
        description: coupon.description,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount,
        expiryDate: coupon.expiryDate.toDate(),
        isApplicable
      });
    }

    // Sort by discount value (highest first)
    availableCoupons.sort((a, b) => {
      if (a.type === 'percentage' && b.type === 'percentage') {
        return b.discount - a.discount;
      } else if (a.type === 'fixed' && b.type === 'fixed') {
        return b.discount - a.discount;
      } else {
        return a.type === 'percentage' ? -1 : 1;
      }
    });

    sendResponse(res, 200, true, {
      coupons: availableCoupons
    }, "Available coupons fetched successfully");

  } catch (error) {
    console.error('❌ Get available coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch available coupons", error.message);
  }
});

// GET /api/coupons/public - Get public coupons (no auth required)
router.get('/public', async (req, res) => {
  try {
    const query = db.collection('coupons')
      .where('isActive', '==', true)
      .where('isPublic', '==', true)
      .where('expiryDate', '>', new Date())
      .orderBy('expiryDate', 'asc')
      .limit(10);

    const snapshot = await query.get();
    const publicCoupons = [];

    snapshot.forEach(doc => {
      const coupon = doc.data();
      
      // Only show if not usage limit exceeded
      if (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit) {
        publicCoupons.push({
          code: coupon.code,
          type: coupon.type,
          discount: coupon.discount,
          description: coupon.description,
          minOrderValue: coupon.minOrderValue,
          maxDiscount: coupon.maxDiscount,
          expiryDate: coupon.expiryDate.toDate()
        });
      }
    });

    sendResponse(res, 200, true, {
      coupons: publicCoupons
    }, "Public coupons fetched successfully");

  } catch (error) {
    console.error('❌ Get public coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch public coupons", error.message);
  }
});

// POST /api/coupons/use - Record coupon usage (called after successful order)
router.post('/use', verifyAuth, [
  body('code').notEmpty().withMessage('Coupon code is required'),
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('discountAmount').isFloat({ min: 0 }).withMessage('Valid discount amount is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { code, orderId, discountAmount } = req.body;
    const userId = req.user.uid;

    // Update coupon usage count
    const couponRef = db.collection('coupons').doc(code.toUpperCase());
    await couponRef.update({
      usedCount: admin.firestore.FieldValue.increment(1),
      lastUsed: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update user-specific usage
    const userUsageRef = db.collection('couponUsage').doc(`${code}_${userId}`);
    const userUsageDoc = await userUsageRef.get();

    if (userUsageDoc.exists) {
      await userUsageRef.update({
        usageCount: admin.firestore.FieldValue.increment(1),
        lastUsed: admin.firestore.FieldValue.serverTimestamp(),
        orders: admin.firestore.FieldValue.arrayUnion({
          orderId,
          discountAmount,
          usedAt: new Date()
        })
      });
    } else {
      await userUsageRef.set({
        userId,
        couponCode: code,
        usageCount: 1,
        firstUsed: admin.firestore.FieldValue.serverTimestamp(),
        lastUsed: admin.firestore.FieldValue.serverTimestamp(),
        orders: [{
          orderId,
          discountAmount,
          usedAt: new Date()
        }]
      });
    }

    sendResponse(res, 200, true, null, "Coupon usage recorded successfully");

  } catch (error) {
    console.error('❌ Record coupon usage error:', error);
    sendResponse(res, 500, false, null, null, "Failed to record coupon usage", error.message);
  }
});

// GET /api/coupons - Get all available coupons for user
router.get('/', verifyAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user.uid;

    // Get all active coupons
    const snapshot = await db.collection('coupons')
      .where('isActive', '==', true)
      .where('expiryDate', '>', new Date())
      .orderBy('expiryDate', 'asc')
      .get();

    let coupons = [];
    snapshot.forEach(doc => {
      const couponData = doc.data();
      coupons.push({
        id: doc.id,
        code: couponData.code,
        type: couponData.type,
        discount: couponData.discount,
        description: couponData.description,
        minOrderValue: couponData.minOrderValue || 0,
        maxDiscount: couponData.maxDiscount,
        expiryDate: couponData.expiryDate?.toDate(),
        usageLimit: couponData.usageLimit,
        usedCount: couponData.usedCount || 0,
        isPublic: couponData.isPublic || false
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedCoupons = coupons.slice(startIndex, endIndex);

    const totalCoupons = coupons.length;
    const totalPages = Math.ceil(totalCoupons / parseInt(limit));

    sendResponse(res, 200, true, {
      coupons: paginatedCoupons,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCoupons,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    }, "Coupons fetched successfully");

  } catch (error) {
    console.error('❌ Get coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch coupons", error.message);
  }
});

// GET /api/coupons/user - Get user-specific coupons
router.get('/user', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Get user's coupon usage history
    const usageSnapshot = await db.collection('couponUsage')
      .where('userId', '==', userId)
      .get();

    const usedCoupons = [];
    usageSnapshot.forEach(doc => {
      const usage = doc.data();
      usedCoupons.push({
        couponCode: usage.couponCode,
        usedAt: usage.usedAt?.toDate(),
        discountAmount: usage.discountAmount,
        orderId: usage.orderId
      });
    });

    // Get available coupons for user
    const availableSnapshot = await db.collection('coupons')
      .where('isActive', '==', true)
      .where('expiryDate', '>', new Date())
      .get();

    const availableCoupons = [];
    availableSnapshot.forEach(doc => {
      const couponData = doc.data();
      
      // Check if user has already used this coupon (if single use)
      const hasUsed = usedCoupons.some(used => used.couponCode === couponData.code);
      
      if (!hasUsed || couponData.usageLimit > 1) {
        availableCoupons.push({
          id: doc.id,
          code: couponData.code,
          type: couponData.type,
          discount: couponData.discount,
          description: couponData.description,
          minOrderValue: couponData.minOrderValue || 0,
          maxDiscount: couponData.maxDiscount,
          expiryDate: couponData.expiryDate?.toDate(),
          canUse: !hasUsed || (couponData.usageLimit > 1 && (couponData.usedCount || 0) < couponData.usageLimit)
        });
      }
    });

    sendResponse(res, 200, true, {
      availableCoupons,
      usedCoupons,
      totalUsed: usedCoupons.length,
      totalAvailable: availableCoupons.length
    }, "User coupons fetched successfully");

  } catch (error) {
    console.error('❌ Get user coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch user coupons", error.message);
  }
});

// GET /api/coupons/stats/:couponCode - Get coupon statistics (Admin only)
router.get('/stats/:couponCode', verifyAuth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Admin access required");
    }

    const { couponCode } = req.params;

    const couponRef = db.collection('coupons').doc(couponCode.toUpperCase());
    const couponDoc = await couponRef.get();

    if (!couponDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Coupon not found");
    }

    const coupon = couponDoc.data();

    // Get usage statistics
    const usageQuery = db.collection('couponUsage')
      .where('couponCode', '==', couponCode.toUpperCase());
    
    const usageSnapshot = await usageQuery.get();
    
    let totalUsers = 0;
    let totalDiscount = 0;
    let totalOrders = 0;

    usageSnapshot.forEach(doc => {
      const usage = doc.data();
      totalUsers++;
      totalOrders += usage.orders?.length || 0;
      
      usage.orders?.forEach(order => {
        totalDiscount += order.discountAmount || 0;
      });
    });

    const stats = {
      coupon: {
        code: coupon.code,
        type: coupon.type,
        discount: coupon.discount,
        description: coupon.description,
        isActive: coupon.isActive,
        createdAt: coupon.createdAt?.toDate(),
        expiryDate: coupon.expiryDate?.toDate()
      },
      usage: {
        totalUsed: coupon.usedCount || 0,
        usageLimit: coupon.usageLimit || null,
        uniqueUsers: totalUsers,
        totalOrders,
        totalDiscountGiven: totalDiscount,
        averageDiscountPerOrder: totalOrders > 0 ? totalDiscount / totalOrders : 0
      }
    };

    sendResponse(res, 200, true, { stats }, "Coupon statistics fetched successfully");

  } catch (error) {
    console.error('❌ Get coupon stats error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch coupon statistics", error.message);
  }
});

module.exports = router;

