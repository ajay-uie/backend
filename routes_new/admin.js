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

// GET /admin/dashboard - Admin Dashboard
router.get('/dashboard', verifyAuth, async (req, res) => {
  try {
    // Mock dashboard data - replace with actual data from Firebase
    const dashboardData = {
      totalOrders: 150,
      totalRevenue: 45000,
      totalProducts: 25,
      totalUsers: 320,
      recentOrders: [],
      topProducts: [],
      analytics: {
        ordersToday: 12,
        revenueToday: 3500,
        newUsersToday: 8
      }
    };

    sendResponse(res, 200, true, dashboardData, "Dashboard data retrieved successfully");
  } catch (error) {
    console.error('Dashboard error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve dashboard data");
  }
});

// GET /admin/countdown-settings - Get countdown settings
router.get('/countdown-settings', async (req, res) => {
  try {
    // Mock countdown settings - replace with actual data from Firebase
    const countdownSettings = {
      active: false,
      endTime: null,
      title: "No Active Countdown",
      description: "No countdown is currently active",
      discount: 0,
      products: []
    };

    sendResponse(res, 200, true, countdownSettings, "Countdown settings retrieved successfully");
  } catch (error) {
    console.error('Countdown settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve countdown settings");
  }
});

// POST /admin/countdown-settings - Update countdown settings
router.post('/countdown-settings', verifyAuth, [
  body('active').isBoolean().withMessage('Active must be a boolean'),
  body('title').optional().isString().withMessage('Title must be a string'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('endTime').optional().isISO8601().withMessage('End time must be a valid date'),
  body('discount').optional().isFloat({ min: 0, max: 100 }).withMessage('Discount must be between 0 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { active, title, description, endTime, discount, products } = req.body;

    // Mock update - replace with actual Firebase update
    const updatedSettings = {
      active,
      title: title || "Special Offer",
      description: description || "Limited time offer",
      endTime,
      discount: discount || 0,
      products: products || [],
      updatedAt: new Date().toISOString()
    };

    sendResponse(res, 200, true, updatedSettings, "Countdown settings updated successfully");
  } catch (error) {
    console.error('Update countdown settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update countdown settings");
  }
});

// GET /admin/analytics - Admin Analytics
router.get('/analytics', verifyAuth, async (req, res) => {
  try {
    const { range = '7d' } = req.query;
    
    // Mock analytics data - replace with actual data from Firebase
    const analyticsData = {
      range,
      totalOrders: 150,
      totalRevenue: 45000,
      totalUsers: 320,
      conversionRate: 3.2,
      averageOrderValue: 300,
      topProducts: [
        { id: '1', name: 'Blue Man', sales: 45, revenue: 13500 },
        { id: '2', name: 'Red Rose', sales: 38, revenue: 11400 },
        { id: '3', name: 'Green Tea', sales: 32, revenue: 9600 }
      ],
      salesChart: [
        { date: '2025-07-14', orders: 12, revenue: 3600 },
        { date: '2025-07-15', orders: 18, revenue: 5400 },
        { date: '2025-07-16', orders: 15, revenue: 4500 },
        { date: '2025-07-17', orders: 22, revenue: 6600 },
        { date: '2025-07-18', orders: 19, revenue: 5700 },
        { date: '2025-07-19', orders: 25, revenue: 7500 },
        { date: '2025-07-20', orders: 20, revenue: 6000 }
      ]
    };

    sendResponse(res, 200, true, analyticsData, "Analytics data retrieved successfully");
  } catch (error) {
    console.error('Analytics error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve analytics data");
  }
});

// GET /admin/signals - Admin Signals/Notifications
router.get('/signals', verifyAuth, async (req, res) => {
  try {
    // Mock signals data - replace with actual data from Firebase
    const signalsData = {
      notifications: [
        {
          id: '1',
          type: 'order',
          title: 'New Order Received',
          message: 'Order #ORD-123456 has been placed',
          timestamp: new Date().toISOString(),
          read: false
        },
        {
          id: '2',
          type: 'inventory',
          title: 'Low Stock Alert',
          message: 'Blue Man perfume is running low (5 units left)',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          read: false
        },
        {
          id: '3',
          type: 'user',
          title: 'New User Registration',
          message: 'A new user has registered',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          read: true
        }
      ],
      unreadCount: 2,
      totalCount: 3
    };

    sendResponse(res, 200, true, signalsData, "Signals retrieved successfully");
  } catch (error) {
    console.error('Signals error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve signals");
  }
});

// POST /admin/signals/mark-read - Mark signals as read
router.post('/signals/mark-read', verifyAuth, [
  body('signalIds').isArray().withMessage('Signal IDs must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { signalIds } = req.body;

    // Mock mark as read - replace with actual Firebase update
    sendResponse(res, 200, true, { markedCount: signalIds.length }, "Signals marked as read successfully");
  } catch (error) {
    console.error('Mark signals read error:', error);
    sendResponse(res, 500, false, null, null, "Failed to mark signals as read");
  }
});

module.exports = router;

