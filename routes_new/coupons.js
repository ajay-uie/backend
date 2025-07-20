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

// POST /coupons/apply - Apply coupon to order
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

    // Mock coupon validation for development
    const mockCoupons = {
      'WELCOME10': {
        code: 'WELCOME10',
        type: 'percentage',
        discount: 10,
        description: 'Welcome discount for new users',
        minOrderValue: 500,
        maxDiscount: 100,
        isActive: true
      },
      'SAVE50': {
        code: 'SAVE50',
        type: 'fixed',
        discount: 50,
        description: 'Flat ₹50 off on orders above ₹300',
        minOrderValue: 300,
        maxDiscount: null,
        isActive: true
      },
      'FESTIVE20': {
        code: 'FESTIVE20',
        type: 'percentage',
        discount: 20,
        description: 'Festive season special - 20% off',
        minOrderValue: 1000,
        maxDiscount: 200,
        isActive: true
      }
    };

    const coupon = mockCoupons[code.toUpperCase()];

    if (!coupon) {
      return sendResponse(res, 404, false, null, null, "Invalid coupon code");
    }

    if (!coupon.isActive) {
      return sendResponse(res, 400, false, null, null, "Coupon is no longer active");
    }

    if (orderTotal < coupon.minOrderValue) {
      return sendResponse(res, 400, false, null, null, `Minimum order value of ₹${coupon.minOrderValue} required`);
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

// GET /coupons/public - Get public coupons (no auth required)
router.get('/public', async (req, res) => {
  try {
    // Mock public coupons data for development
    const publicCoupons = [
      {
        code: "WELCOME10",
        type: "percentage",
        discount: 10,
        description: "Welcome discount for new users",
        minOrderValue: 500,
        maxDiscount: 100,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        isActive: true
      },
      {
        code: "SAVE50",
        type: "fixed",
        discount: 50,
        description: "Flat ₹50 off on orders above ₹300",
        minOrderValue: 300,
        maxDiscount: null,
        expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
        isActive: true
      },
      {
        code: "FESTIVE20",
        type: "percentage",
        discount: 20,
        description: "Festive season special - 20% off",
        minOrderValue: 1000,
        maxDiscount: 200,
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        isActive: true
      }
    ];

    sendResponse(res, 200, true, { coupons: publicCoupons }, "Public coupons retrieved successfully");

  } catch (error) {
    console.error('❌ Get public coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve public coupons", error.message);
  }
});

// GET /coupons/available - Get available coupons for user
router.get('/available', verifyAuth, async (req, res) => {
  try {
    const { orderTotal } = req.query;

    // Mock available coupons for development
    const availableCoupons = [
      {
        code: "WELCOME10",
        type: "percentage",
        discount: 10,
        description: "Welcome discount for new users",
        minOrderValue: 500,
        maxDiscount: 100,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        code: "SAVE50",
        type: "fixed",
        discount: 50,
        description: "Flat ₹50 off on orders above ₹300",
        minOrderValue: 300,
        maxDiscount: null,
        expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      }
    ];

    // Filter by order total if provided
    const filteredCoupons = orderTotal 
      ? availableCoupons.filter(coupon => parseFloat(orderTotal) >= coupon.minOrderValue)
      : availableCoupons;

    sendResponse(res, 200, true, { coupons: filteredCoupons }, "Available coupons retrieved successfully");

  } catch (error) {
    console.error('❌ Get available coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve available coupons", error.message);
  }
});

module.exports = router;

