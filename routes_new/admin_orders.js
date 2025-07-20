const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../auth/firebaseConfig');
const jwt = require('jsonwebtoken');

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

// Admin auth middleware
const verifyAdminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return sendResponse(res, 401, false, null, null, "No token provided");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "development-jwt-secret-key");
    
    // For development, assume valid admin if token is valid
    req.user = {
      uid: decoded.uid || 'admin-uid',
      role: 'admin',
      email: decoded.email || 'admin@test.com'
    };

    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    return sendResponse(res, 401, false, null, null, "Invalid token");
  }
};

// PATCH /admin/orders/:id/status - Update order status (Admin only)
router.patch('/:id/status', verifyAdminAuth, [
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Valid status is required'),
  body('note').optional().isString().withMessage('Note must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { id } = req.params;
    const { status, note, trackingNumber } = req.body;

    // Mock order update for development
    const mockOrder = {
      id,
      status,
      note: note || '',
      trackingNumber: trackingNumber || '',
      updatedAt: new Date(),
      updatedBy: req.user.uid
    };

    sendResponse(res, 200, true, {
      order: mockOrder
    }, "Order status updated successfully");

  } catch (error) {
    console.error('❌ Update order status error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update order status", error.message);
  }
});

// GET /admin/orders - Get all orders (Admin only)
router.get('/', verifyAdminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    // Mock orders data for development
    const mockOrders = [
      {
        id: 'order-1',
        orderNumber: 'ORD-001',
        userId: 'user-1',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        total: 1500,
        status: 'pending',
        items: [
          { productId: 'prod-1', name: 'Blue Man', quantity: 1, price: 1500 }
        ],
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
      },
      {
        id: 'order-2',
        orderNumber: 'ORD-002',
        userId: 'user-2',
        customerName: 'Jane Smith',
        customerEmail: 'jane@example.com',
        total: 2000,
        status: 'confirmed',
        items: [
          { productId: 'prod-2', name: 'Red Rose', quantity: 2, price: 1000 }
        ],
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
      }
    ];

    // Filter by status if provided
    let filteredOrders = mockOrders;
    if (status) {
      filteredOrders = mockOrders.filter(order => order.status === status);
    }

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

    sendResponse(res, 200, true, {
      orders: paginatedOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(filteredOrders.length / parseInt(limit)),
        totalOrders: filteredOrders.length,
        hasNextPage: endIndex < filteredOrders.length,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    }, "Admin orders retrieved successfully");

  } catch (error) {
    console.error('❌ Get admin orders error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve admin orders", error.message);
  }
});

// GET /admin/orders/:id - Get single order (Admin only)
router.get('/:id', verifyAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Mock order data for development
    const mockOrder = {
      id,
      orderNumber: `ORD-${id.toUpperCase()}`,
      userId: 'user-1',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '+1234567890',
      total: 1500,
      status: 'pending',
      paymentMethod: 'card',
      paymentStatus: 'completed',
      items: [
        { 
          productId: 'prod-1', 
          name: 'Blue Man', 
          quantity: 1, 
          price: 1500,
          image: '/images/blue-man.jpg'
        }
      ],
      shippingAddress: {
        name: 'John Doe',
        phone: '+1234567890',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        pincode: '10001'
      },
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
    };

    sendResponse(res, 200, true, { order: mockOrder }, "Order retrieved successfully");

  } catch (error) {
    console.error('❌ Get admin order error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve order", error.message);
  }
});

module.exports = router;

