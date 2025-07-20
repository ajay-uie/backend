const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../auth/firebaseConfig');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

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

// Helper: Create sample coupons if none exist
const ensureSampleCoupons = async () => {
  try {
    const snapshot = await db.collection('coupons').limit(1).get();
    
    if (snapshot.empty) {
      console.log('🎫 No coupons found, creating sample coupons...');
      
      const sampleCoupons = [
        {
          code: 'WELCOME10',
          type: 'percentage',
          discount: 10,
          description: 'Welcome discount for new users',
          minOrderValue: 500,
          maxDiscount: 100,
          isActive: true,
          isPublic: true,
          usageLimit: 1000,
          usedCount: 0,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          code: 'SAVE50',
          type: 'fixed',
          discount: 50,
          description: 'Flat ₹50 off on orders above ₹300',
          minOrderValue: 300,
          maxDiscount: null,
          isActive: true,
          isPublic: true,
          usageLimit: 500,
          usedCount: 0,
          expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          code: 'FESTIVE20',
          type: 'percentage',
          discount: 20,
          description: 'Festive season special - 20% off',
          minOrderValue: 1000,
          maxDiscount: 200,
          isActive: true,
          isPublic: true,
          usageLimit: 200,
          usedCount: 0,
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          code: 'FIRSTORDER',
          type: 'percentage',
          discount: 15,
          description: 'First order special discount',
          minOrderValue: 800,
          maxDiscount: 150,
          isActive: true,
          isPublic: false,
          usageLimit: 100,
          usedCount: 0,
          userSpecific: true,
          expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      ];

      const batch = db.batch();
      sampleCoupons.forEach(coupon => {
        const docRef = db.collection('coupons').doc(coupon.code);
        batch.set(docRef, coupon);
      });
      
      await batch.commit();
      console.log('✅ Sample coupons created successfully');
    }
  } catch (error) {
    console.error('❌ Error ensuring sample coupons:', error);
  }
};

// Initialize sample coupons on module load
ensureSampleCoupons();

// POST /coupons/apply - Apply coupon to order
router.post('/apply', authMiddleware, [
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

    console.log(`🎫 Applying coupon: ${code} for user: ${userId}, order total: ${orderTotal}`);

    // Get coupon from Firebase
    const couponDoc = await db.collection('coupons').doc(code.toUpperCase()).get();

    if (!couponDoc.exists) {
      console.log(`❌ Coupon not found: ${code}`);
      return sendResponse(res, 404, false, null, null, "Invalid coupon code");
    }

    const coupon = couponDoc.data();

    // Check if coupon is active
    if (!coupon.isActive) {
      return sendResponse(res, 400, false, null, null, "Coupon is no longer active");
    }

    // Check expiry date
    if (coupon.expiryDate && coupon.expiryDate.toDate() < new Date()) {
      return sendResponse(res, 400, false, null, null, "Coupon has expired");
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return sendResponse(res, 400, false, null, null, "Coupon usage limit exceeded");
    }

    // Check minimum order value
    if (orderTotal < coupon.minOrderValue) {
      return sendResponse(res, 400, false, null, null, `Minimum order value of ₹${coupon.minOrderValue} required`);
    }

    // Check if user has already used this coupon (for user-specific coupons)
    if (coupon.userSpecific) {
      const userCouponUsage = await db.collection('coupon_usage')
        .where('userId', '==', userId)
        .where('couponCode', '==', code.toUpperCase())
        .get();
      
      if (!userCouponUsage.empty) {
        return sendResponse(res, 400, false, null, null, "You have already used this coupon");
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

    // Ensure discount doesn't exceed order total
    discount = Math.min(discount, orderTotal);

    console.log(`✅ Coupon applied: ${code}, discount: ₹${discount}`);

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

// GET /coupons/public - Get public coupons (no auth required)
router.get('/public', async (req, res) => {
  try {
    console.log('🎫 Fetching public coupons...');

    const snapshot = await db.collection('coupons')
      .where('isActive', '==', true)
      .where('isPublic', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    const coupons = [];
    const now = new Date();

    snapshot.forEach(doc => {
      const couponData = doc.data();
      
      // Filter out expired coupons
      if (!couponData.expiryDate || couponData.expiryDate.toDate() > now) {
        coupons.push({
          code: couponData.code,
          type: couponData.type,
          discount: couponData.discount,
          description: couponData.description,
          minOrderValue: couponData.minOrderValue,
          maxDiscount: couponData.maxDiscount,
          expiryDate: couponData.expiryDate?.toDate(),
          usageLimit: couponData.usageLimit,
          usedCount: couponData.usedCount
        });
      }
    });

    console.log(`✅ Found ${coupons.length} public coupons`);

    sendResponse(res, 200, true, { coupons }, "Public coupons retrieved successfully");

  } catch (error) {
    console.error('❌ Get public coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve public coupons", error.message);
  }
});

// GET /coupons/available - Get available coupons for user
router.get('/available', authMiddleware, async (req, res) => {
  try {
    const { orderTotal } = req.query;
    const userId = req.user.uid;

    console.log(`🎫 Fetching available coupons for user: ${userId}, order total: ${orderTotal}`);

    const snapshot = await db.collection('coupons')
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    const availableCoupons = [];
    const now = new Date();

    for (const doc of snapshot.docs) {
      const couponData = doc.data();
      
      // Filter out expired coupons
      if (couponData.expiryDate && couponData.expiryDate.toDate() <= now) {
        continue;
      }

      // Filter by order total if provided
      if (orderTotal && parseFloat(orderTotal) < couponData.minOrderValue) {
        continue;
      }

      // Check usage limit
      if (couponData.usageLimit && couponData.usedCount >= couponData.usageLimit) {
        continue;
      }

      // Check if user has already used this coupon (for user-specific coupons)
      if (couponData.userSpecific) {
        const userCouponUsage = await db.collection('coupon_usage')
          .where('userId', '==', userId)
          .where('couponCode', '==', couponData.code)
          .get();
        
        if (!userCouponUsage.empty) {
          continue;
        }
      }

      availableCoupons.push({
        code: couponData.code,
        type: couponData.type,
        discount: couponData.discount,
        description: couponData.description,
        minOrderValue: couponData.minOrderValue,
        maxDiscount: couponData.maxDiscount,
        expiryDate: couponData.expiryDate?.toDate(),
        userSpecific: couponData.userSpecific || false
      });
    }

    console.log(`✅ Found ${availableCoupons.length} available coupons for user`);

    sendResponse(res, 200, true, { coupons: availableCoupons }, "Available coupons retrieved successfully");

  } catch (error) {
    console.error('❌ Get available coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve available coupons", error.message);
  }
});

// POST /coupons/use - Mark coupon as used (called after successful order)
router.post('/use', authMiddleware, [
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

    console.log(`🎫 Marking coupon as used: ${code} for order: ${orderId}`);

    // Update coupon usage count
    const couponRef = db.collection('coupons').doc(code.toUpperCase());
    await couponRef.update({
      usedCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Record coupon usage
    await db.collection('coupon_usage').add({
      userId,
      couponCode: code.toUpperCase(),
      orderId,
      discountAmount,
      usedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Coupon usage recorded: ${code}`);

    sendResponse(res, 200, true, null, "Coupon usage recorded successfully");

  } catch (error) {
    console.error('❌ Record coupon usage error:', error);
    sendResponse(res, 500, false, null, null, "Failed to record coupon usage", error.message);
  }
});

// Admin routes for coupon management

// GET /coupons/admin/all - Get all coupons (Admin only)
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const snapshot = await db.collection('coupons').orderBy('createdAt', 'desc').get();

    const coupons = [];
    snapshot.forEach(doc => {
      const couponData = doc.data();
      coupons.push({
        id: doc.id,
        ...couponData,
        createdAt: couponData.createdAt?.toDate(),
        updatedAt: couponData.updatedAt?.toDate(),
        expiryDate: couponData.expiryDate?.toDate()
      });
    });

    sendResponse(res, 200, true, { coupons }, "All coupons retrieved successfully");

  } catch (error) {
    console.error('❌ Get all coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve coupons", error.message);
  }
});

// POST /coupons/admin/create - Create new coupon (Admin only)
router.post('/admin/create', authMiddleware, adminMiddleware, [
  body('code').notEmpty().withMessage('Coupon code is required'),
  body('type').isIn(['percentage', 'fixed']).withMessage('Valid coupon type is required'),
  body('discount').isFloat({ min: 0 }).withMessage('Valid discount value is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('minOrderValue').isFloat({ min: 0 }).withMessage('Valid minimum order value is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const {
      code,
      type,
      discount,
      description,
      minOrderValue,
      maxDiscount,
      isPublic = true,
      userSpecific = false,
      usageLimit,
      expiryDate
    } = req.body;

    const couponCode = code.toUpperCase();

    // Check if coupon already exists
    const existingCoupon = await db.collection('coupons').doc(couponCode).get();
    if (existingCoupon.exists) {
      return sendResponse(res, 400, false, null, null, "Coupon code already exists");
    }

    const couponData = {
      code: couponCode,
      type,
      discount: parseFloat(discount),
      description,
      minOrderValue: parseFloat(minOrderValue),
      maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
      isActive: true,
      isPublic: Boolean(isPublic),
      userSpecific: Boolean(userSpecific),
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      usedCount: 0,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid
    };

    await db.collection('coupons').doc(couponCode).set(couponData);

    console.log(`✅ Coupon created: ${couponCode}`);

    sendResponse(res, 201, true, {
      coupon: {
        id: couponCode,
        ...couponData,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }, "Coupon created successfully");

  } catch (error) {
    console.error('❌ Create coupon error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create coupon", error.message);
  }
});

module.exports = router;

