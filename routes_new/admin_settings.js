const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../auth/firebaseConfig');
const { adminMiddleware } = require('../middleware/auth');

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

// Helper: Ensure default settings exist
const ensureDefaultSettings = async () => {
  try {
    const settingsDoc = await db.collection('settings').doc('site-settings').get();
    
    if (!settingsDoc.exists) {
      console.log('⚙️ No settings found, creating default settings...');
      
      const defaultSettings = {
        siteName: 'Fragransia',
        siteDescription: 'Premium Fragrances for Every Occasion',
        currency: 'INR',
        shippingFee: 99,
        freeShippingThreshold: 2000,
        taxRate: 18,
        contactEmail: 'contact@fragransia.com',
        supportPhone: '+91 9876543210',
        address: 'Mumbai, Maharashtra, India',
        socialMedia: {
          facebook: '',
          instagram: '',
          twitter: '',
          youtube: ''
        },
        paymentMethods: ['razorpay', 'cod'],
        features: {
          wishlist: true,
          reviews: true,
          coupons: true,
          notifications: true
        },
        createdAt: admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
        updatedAt: admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date()
      };
      
      await db.collection('settings').doc('site-settings').set(defaultSettings);
      console.log('✅ Default settings created successfully');
    }
  } catch (error) {
    console.error('❌ Error ensuring default settings:', error);
  }
};

// Initialize default settings on module load
ensureDefaultSettings();

// GET /api/admin/settings - Get all settings
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const settingsDoc = await db.collection('settings').doc('site-settings').get();
    
    if (!settingsDoc.exists) {
      await ensureDefaultSettings();
      const newSettingsDoc = await db.collection('settings').doc('site-settings').get();
      const settings = newSettingsDoc.data();
      return sendResponse(res, 200, true, settings, "Settings retrieved successfully");
    }
    
    const settings = settingsDoc.data();
    sendResponse(res, 200, true, settings, "Settings retrieved successfully");
    
  } catch (error) {
    console.error('❌ Get settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve settings", error.message);
  }
});

// PUT /api/admin/settings - Update settings
router.put('/', [
  adminMiddleware,
  body('siteName').optional().notEmpty().withMessage('Site name cannot be empty'),
  body('currency').optional().notEmpty().withMessage('Currency cannot be empty'),
  body('shippingFee').optional().isNumeric().withMessage('Shipping fee must be a number'),
  body('freeShippingThreshold').optional().isNumeric().withMessage('Free shipping threshold must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const updateData = {
      ...req.body,
      updatedAt: admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date()
    };

    await db.collection('settings').doc('site-settings').update(updateData);

    sendResponse(res, 200, true, updateData, "Settings updated successfully");

  } catch (error) {
    console.error('❌ Update settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update settings", error.message);
  }
});

// GET /api/admin/settings/shipping - Get shipping settings
router.get('/shipping', adminMiddleware, async (req, res) => {
  try {
    const settingsDoc = await db.collection('settings').doc('site-settings').get();
    
    if (!settingsDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Settings not found");
    }
    
    const settings = settingsDoc.data();
    const shippingSettings = {
      shippingFee: settings.shippingFee || 99,
      freeShippingThreshold: settings.freeShippingThreshold || 2000,
      shippingZones: settings.shippingZones || []
    };
    
    sendResponse(res, 200, true, shippingSettings, "Shipping settings retrieved successfully");
    
  } catch (error) {
    console.error('❌ Get shipping settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve shipping settings", error.message);
  }
});

// PUT /api/admin/settings/shipping - Update shipping settings
router.put('/shipping', [
  adminMiddleware,
  body('shippingFee').isNumeric().withMessage('Shipping fee must be a number'),
  body('freeShippingThreshold').isNumeric().withMessage('Free shipping threshold must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const { shippingFee, freeShippingThreshold, shippingZones } = req.body;
    
    const updateData = {
      shippingFee,
      freeShippingThreshold,
      shippingZones: shippingZones || [],
      updatedAt: admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date()
    };

    await db.collection('settings').doc('site-settings').update(updateData);

    sendResponse(res, 200, true, updateData, "Shipping settings updated successfully");

  } catch (error) {
    console.error('❌ Update shipping settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update shipping settings", error.message);
  }
});

module.exports = router;

