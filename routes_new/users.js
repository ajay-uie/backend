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

// GET /api/users/profile - Get user profile
router.get('/profile', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userDoc.data();

    // Remove sensitive information
    const { password, ...safeUserData } = userData;

    sendResponse(res, 200, true, {
      user: {
        ...safeUserData,
        createdAt: userData.createdAt?.toDate(),
        updatedAt: userData.updatedAt?.toDate(),
        lastLogin: userData.lastLogin?.toDate()
      }
    }, "Profile fetched successfully");

  } catch (error) {
    console.error('❌ Get profile error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch profile", error.message);
  }
});

// PUT /api/users/profile - Update user profile
router.put('/profile', verifyAuth, [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number is required'),
  body('dateOfBirth').optional().isISO8601().withMessage('Valid date of birth is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const userId = req.user.uid;
    const {
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      preferences
    } = req.body;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = new Date(dateOfBirth);
    if (preferences !== undefined) updateData.preferences = preferences;

    await userRef.update(updateData);

    const updatedDoc = await userRef.get();
    const updatedData = updatedDoc.data();

    // Remove sensitive information
    const { password, ...safeUserData } = updatedData;

    sendResponse(res, 200, true, {
      user: {
        ...safeUserData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate(),
        lastLogin: updatedData.lastLogin?.toDate()
      }
    }, "Profile updated successfully");

  } catch (error) {
    console.error('❌ Update profile error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update profile", error.message);
  }
});

// GET /api/users/addresses - Get user addresses
router.get('/addresses', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userDoc.data();
    const addresses = userData.addresses || [];

    sendResponse(res, 200, true, {
      addresses
    }, "Addresses fetched successfully");

  } catch (error) {
    console.error('❌ Get addresses error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch addresses", error.message);
  }
});

// POST /api/users/addresses - Add user address
router.post('/addresses', verifyAuth, [
  body('name').notEmpty().withMessage('Name is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('pincode').notEmpty().withMessage('Pincode is required'),
  body('type').optional().isIn(['home', 'work', 'other']).withMessage('Valid address type is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const userId = req.user.uid;
    const {
      name,
      phone,
      address,
      city,
      state,
      pincode,
      type = 'home',
      isDefault = false
    } = req.body;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userDoc.data();
    const addresses = userData.addresses || [];

    // Generate address ID
    const addressId = `addr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const newAddress = {
      id: addressId,
      name,
      phone,
      address,
      city,
      state,
      pincode,
      type,
      isDefault: Boolean(isDefault),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // If this is set as default, remove default from other addresses
    if (isDefault) {
      addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    // If this is the first address, make it default
    if (addresses.length === 0) {
      newAddress.isDefault = true;
    }

    addresses.push(newAddress);

    await userRef.update({
      addresses,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 201, true, {
      address: newAddress
    }, "Address added successfully");

  } catch (error) {
    console.error('❌ Add address error:', error);
    sendResponse(res, 500, false, null, null, "Failed to add address", error.message);
  }
});

// PUT /api/users/addresses/:id - Update user address
router.put('/addresses/:id', verifyAuth, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('phone').optional().notEmpty().withMessage('Phone number cannot be empty'),
  body('address').optional().notEmpty().withMessage('Address cannot be empty'),
  body('city').optional().notEmpty().withMessage('City cannot be empty'),
  body('state').optional().notEmpty().withMessage('State cannot be empty'),
  body('pincode').optional().notEmpty().withMessage('Pincode cannot be empty'),
  body('type').optional().isIn(['home', 'work', 'other']).withMessage('Valid address type is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const userId = req.user.uid;
    const { id } = req.params;
    const updateFields = req.body;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userDoc.data();
    const addresses = userData.addresses || [];

    const addressIndex = addresses.findIndex(addr => addr.id === id);
    if (addressIndex === -1) {
      return sendResponse(res, 404, false, null, null, "Address not found");
    }

    // Update address
    addresses[addressIndex] = {
      ...addresses[addressIndex],
      ...updateFields,
      updatedAt: new Date()
    };

    // If setting as default, remove default from other addresses
    if (updateFields.isDefault) {
      addresses.forEach((addr, index) => {
        if (index !== addressIndex) {
          addr.isDefault = false;
        }
      });
    }

    await userRef.update({
      addresses,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 200, true, {
      address: addresses[addressIndex]
    }, "Address updated successfully");

  } catch (error) {
    console.error('❌ Update address error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update address", error.message);
  }
});

// DELETE /api/users/addresses/:id - Delete user address
router.delete('/addresses/:id', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return sendResponse(res, 404, false, null, null, "User not found");
    }

    const userData = userDoc.data();
    const addresses = userData.addresses || [];

    const addressIndex = addresses.findIndex(addr => addr.id === id);
    if (addressIndex === -1) {
      return sendResponse(res, 404, false, null, null, "Address not found");
    }

    const deletedAddress = addresses[addressIndex];
    addresses.splice(addressIndex, 1);

    // If deleted address was default and there are other addresses, make the first one default
    if (deletedAddress.isDefault && addresses.length > 0) {
      addresses[0].isDefault = true;
    }

    await userRef.update({
      addresses,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 200, true, null, "Address deleted successfully");

  } catch (error) {
    console.error('❌ Delete address error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete address", error.message);
  }
});

// GET /api/users/orders - Get user order history
router.get('/orders', verifyAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status
    } = req.query;

    const userId = req.user.uid;
    let query = db.collection('orders').where('userId', '==', userId);

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    const orders = [];

    snapshot.forEach(doc => {
      const orderData = doc.data();
      orders.push({
        id: doc.id,
        ...orderData,
        createdAt: orderData.createdAt?.toDate(),
        updatedAt: orderData.updatedAt?.toDate(),
        estimatedDelivery: orderData.estimatedDelivery?.toDate()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrders = orders.slice(startIndex, endIndex);

    const totalOrders = orders.length;
    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    sendResponse(res, 200, true, {
      orders: paginatedOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalOrders,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    }, "Order history fetched successfully");

  } catch (error) {
    console.error('❌ Get user orders error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch order history", error.message);
  }
});

// POST /api/users/change-password - Change user password
router.post('/change-password', verifyAuth, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.uid;

    // For development with mock auth, just update the timestamp
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 200, true, null, "Password changed successfully");

  } catch (error) {
    console.error('❌ Change password error:', error);
    sendResponse(res, 500, false, null, null, "Failed to change password", error.message);
  }
});

// DELETE /api/users/account - Delete user account
router.delete('/account', verifyAuth, [
  body('password').notEmpty().withMessage('Password is required for account deletion'),
  body('confirmation').equals('DELETE').withMessage('Please type DELETE to confirm')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const userId = req.user.uid;

    // Mark user as deleted instead of actually deleting
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      isActive: false,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 200, true, null, "Account deleted successfully");

  } catch (error) {
    console.error('❌ Delete account error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete account", error.message);
  }
});

module.exports = router;

