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

// Helper: Create default settings if none exist
const ensureDefaultSettings = async () => {
  try {
    const settingsDoc = await db.collection('settings').doc('general').get();
    
    if (!settingsDoc.exists) {
      console.log('⚙️ No settings found, creating default settings...');
      
      const defaultSettings = {
        siteName: 'Fragransia',
        siteDescription: 'Premium fragrances and perfumes',
        siteUrl: 'https://www.fragransia.in',
        contactEmail: 'admin@fragransia.in',
        supportEmail: 'support@fragransia.in',
        phoneNumber: '+91-9876543210',
        address: {
          street: '123 Fragrance Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          country: 'India',
          zipCode: '400001'
        },
        socialMedia: {
          facebook: 'https://facebook.com/fragransia',
          instagram: 'https://instagram.com/fragransia',
          twitter: 'https://twitter.com/fragransia',
          youtube: 'https://youtube.com/fragransia'
        },
        businessHours: {
          monday: '9:00 AM - 6:00 PM',
          tuesday: '9:00 AM - 6:00 PM',
          wednesday: '9:00 AM - 6:00 PM',
          thursday: '9:00 AM - 6:00 PM',
          friday: '9:00 AM - 6:00 PM',
          saturday: '10:00 AM - 4:00 PM',
          sunday: 'Closed'
        },
        shipping: {
          freeShippingThreshold: 500,
          standardShippingCost: 50,
          expressShippingCost: 100,
          estimatedDeliveryDays: '3-5 business days'
        },
        payment: {
          acceptedMethods: ['Credit Card', 'Debit Card', 'UPI', 'Net Banking', 'COD'],
          codAvailable: true,
          codCharges: 25
        },
        notifications: {
          emailNotifications: true,
          smsNotifications: true,
          pushNotifications: true,
          orderUpdates: true,
          promotionalEmails: true
        },
        maintenance: {
          isMaintenanceMode: false,
          maintenanceMessage: 'We are currently performing scheduled maintenance. Please check back soon.'
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('settings').doc('general').set(defaultSettings);
      console.log('✅ Default settings created successfully');
    }
  } catch (error) {
    console.error('❌ Error ensuring default settings:', error);
  }
};

// Initialize default settings on module load
ensureDefaultSettings();

// GET /admin/settings - Get all settings
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('⚙️ Admin fetching settings...');

    const settingsDoc = await db.collection('settings').doc('general').get();

    if (!settingsDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Settings not found");
    }

    const settingsData = settingsDoc.data();

    console.log('✅ Admin settings fetched successfully');

    sendResponse(res, 200, true, {
      settings: {
        ...settingsData,
        createdAt: settingsData.createdAt?.toDate(),
        updatedAt: settingsData.updatedAt?.toDate()
      }
    }, "Settings fetched successfully");

  } catch (error) {
    console.error('❌ Admin get settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch settings", error.message);
  }
});

// PUT /admin/settings - Update settings
router.put('/', authMiddleware, adminMiddleware, [
  body('siteName').optional().notEmpty().withMessage('Site name cannot be empty'),
  body('contactEmail').optional().isEmail().withMessage('Valid contact email is required'),
  body('supportEmail').optional().isEmail().withMessage('Valid support email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    console.log('⚙️ Admin updating settings...');

    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    };

    await db.collection('settings').doc('general').update(updateData);

    const updatedDoc = await db.collection('settings').doc('general').get();
    const updatedData = updatedDoc.data();

    console.log('✅ Admin settings updated successfully');

    sendResponse(res, 200, true, {
      settings: {
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate()
      }
    }, "Settings updated successfully");

  } catch (error) {
    console.error('❌ Admin update settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update settings", error.message);
  }
});

// GET /admin/settings/maintenance - Get maintenance mode status
router.get('/maintenance', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('⚙️ Admin fetching maintenance status...');

    const settingsDoc = await db.collection('settings').doc('general').get();

    if (!settingsDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Settings not found");
    }

    const settingsData = settingsDoc.data();
    const maintenanceData = settingsData.maintenance || {
      isMaintenanceMode: false,
      maintenanceMessage: 'We are currently performing scheduled maintenance. Please check back soon.'
    };

    console.log('✅ Admin maintenance status fetched successfully');

    sendResponse(res, 200, true, { maintenance: maintenanceData }, "Maintenance status fetched successfully");

  } catch (error) {
    console.error('❌ Admin get maintenance status error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch maintenance status", error.message);
  }
});

// POST /admin/settings/maintenance/toggle - Toggle maintenance mode
router.post('/maintenance/toggle', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('⚙️ Admin toggling maintenance mode...');

    const settingsDoc = await db.collection('settings').doc('general').get();

    if (!settingsDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Settings not found");
    }

    const settingsData = settingsDoc.data();
    const currentMaintenanceMode = settingsData.maintenance?.isMaintenanceMode || false;
    const newMaintenanceMode = !currentMaintenanceMode;

    await db.collection('settings').doc('general').update({
      'maintenance.isMaintenanceMode': newMaintenanceMode,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    });

    console.log(`✅ Admin maintenance mode toggled: ${currentMaintenanceMode} → ${newMaintenanceMode}`);

    sendResponse(res, 200, true, {
      maintenance: {
        isMaintenanceMode: newMaintenanceMode,
        message: `Maintenance mode ${newMaintenanceMode ? 'enabled' : 'disabled'}`
      }
    }, `Maintenance mode ${newMaintenanceMode ? 'enabled' : 'disabled'} successfully`);

  } catch (error) {
    console.error('❌ Admin toggle maintenance mode error:', error);
    sendResponse(res, 500, false, null, null, "Failed to toggle maintenance mode", error.message);
  }
});

// GET /admin/settings/backup - Create settings backup
router.get('/backup', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('⚙️ Admin creating settings backup...');

    const settingsDoc = await db.collection('settings').doc('general').get();

    if (!settingsDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Settings not found");
    }

    const settingsData = settingsDoc.data();
    const backupData = {
      ...settingsData,
      backupCreatedAt: new Date().toISOString(),
      backupCreatedBy: req.user.uid
    };

    // Store backup
    await db.collection('settings_backups').add(backupData);

    console.log('✅ Admin settings backup created successfully');

    sendResponse(res, 200, true, { backup: backupData }, "Settings backup created successfully");

  } catch (error) {
    console.error('❌ Admin create settings backup error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create settings backup", error.message);
  }
});

// POST /admin/settings/reset - Reset settings to default
router.post('/reset', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('⚙️ Admin resetting settings to default...');

    // Create backup before reset
    const currentSettingsDoc = await db.collection('settings').doc('general').get();
    if (currentSettingsDoc.exists) {
      const backupData = {
        ...currentSettingsDoc.data(),
        backupCreatedAt: new Date().toISOString(),
        backupCreatedBy: req.user.uid,
        backupReason: 'Before reset to default'
      };
      await db.collection('settings_backups').add(backupData);
    }

    // Reset to default settings
    await ensureDefaultSettings();

    const resetSettingsDoc = await db.collection('settings').doc('general').get();
    const resetSettingsData = resetSettingsDoc.data();

    console.log('✅ Admin settings reset to default successfully');

    sendResponse(res, 200, true, {
      settings: {
        ...resetSettingsData,
        createdAt: resetSettingsData.createdAt?.toDate(),
        updatedAt: resetSettingsData.updatedAt?.toDate()
      }
    }, "Settings reset to default successfully");

  } catch (error) {
    console.error('❌ Admin reset settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to reset settings", error.message);
  }
});

module.exports = router;

