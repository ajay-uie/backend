const express = require('express');
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

// GET /admin/signals - Get system signals and alerts
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('🚨 Admin fetching system signals...');

    // Get various system signals
    const [
      lowStockProducts,
      pendingOrders,
      recentErrors,
      systemHealth
    ] = await Promise.all([
      // Low stock products
      db.collection('products')
        .where('stock', '<=', 10)
        .where('isActive', '==', true)
        .get(),
      
      // Pending orders
      db.collection('orders')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get(),
      
      // Recent errors (mock data for now)
      Promise.resolve([]),
      
      // System health check
      Promise.resolve({
        database: 'healthy',
        storage: 'healthy',
        api: 'healthy'
      })
    ]);

    // Process low stock products
    const lowStockData = [];
    lowStockProducts.forEach(doc => {
      const productData = doc.data();
      lowStockData.push({
        id: doc.id,
        name: productData.name,
        stock: productData.stock,
        category: productData.category,
        price: productData.price
      });
    });

    // Process pending orders
    const pendingOrdersData = [];
    pendingOrders.forEach(doc => {
      const orderData = doc.data();
      pendingOrdersData.push({
        id: doc.id,
        customerName: orderData.customerName || 'Unknown',
        total: orderData.total || 0,
        createdAt: orderData.createdAt?.toDate(),
        status: orderData.status
      });
    });

    // Mock recent errors
    const recentErrorsData = [
      {
        id: 'error_1',
        type: 'API_ERROR',
        message: 'Payment gateway timeout',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        severity: 'medium',
        resolved: false
      },
      {
        id: 'error_2',
        type: 'DATABASE_WARNING',
        message: 'High query response time detected',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
        severity: 'low',
        resolved: true
      }
    ];

    // Generate alerts based on signals
    const alerts = [];

    if (lowStockData.length > 0) {
      alerts.push({
        type: 'LOW_STOCK',
        severity: 'high',
        message: `${lowStockData.length} products are running low on stock`,
        count: lowStockData.length,
        action: 'Restock products immediately'
      });
    }

    if (pendingOrdersData.length > 5) {
      alerts.push({
        type: 'PENDING_ORDERS',
        severity: 'medium',
        message: `${pendingOrdersData.length} orders are pending processing`,
        count: pendingOrdersData.length,
        action: 'Process pending orders'
      });
    }

    if (recentErrorsData.filter(e => !e.resolved).length > 0) {
      alerts.push({
        type: 'SYSTEM_ERRORS',
        severity: 'high',
        message: 'Unresolved system errors detected',
        count: recentErrorsData.filter(e => !e.resolved).length,
        action: 'Review and resolve system errors'
      });
    }

    const signalsData = {
      alerts,
      lowStockProducts: lowStockData,
      pendingOrders: pendingOrdersData,
      recentErrors: recentErrorsData,
      systemHealth,
      summary: {
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.severity === 'high').length,
        lowStockCount: lowStockData.length,
        pendingOrdersCount: pendingOrdersData.length,
        unresolvedErrorsCount: recentErrorsData.filter(e => !e.resolved).length
      }
    };

    console.log(`✅ Admin system signals fetched: ${alerts.length} alerts found`);

    sendResponse(res, 200, true, signalsData, "System signals fetched successfully");

  } catch (error) {
    console.error('❌ Admin get signals error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch system signals", error.message);
  }
});

// GET /admin/signals/alerts - Get only alerts
router.get('/alerts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('🚨 Admin fetching alerts only...');

    // Get critical system data for alerts
    const [lowStockCount, pendingOrdersCount] = await Promise.all([
      db.collection('products')
        .where('stock', '<=', 10)
        .where('isActive', '==', true)
        .get()
        .then(snapshot => snapshot.size),
      
      db.collection('orders')
        .where('status', '==', 'pending')
        .get()
        .then(snapshot => snapshot.size)
    ]);

    const alerts = [];

    if (lowStockCount > 0) {
      alerts.push({
        id: 'low_stock_alert',
        type: 'LOW_STOCK',
        severity: 'high',
        message: `${lowStockCount} products are running low on stock`,
        count: lowStockCount,
        action: 'Restock products immediately',
        timestamp: new Date()
      });
    }

    if (pendingOrdersCount > 5) {
      alerts.push({
        id: 'pending_orders_alert',
        type: 'PENDING_ORDERS',
        severity: 'medium',
        message: `${pendingOrdersCount} orders are pending processing`,
        count: pendingOrdersCount,
        action: 'Process pending orders',
        timestamp: new Date()
      });
    }

    console.log(`✅ Admin alerts fetched: ${alerts.length} alerts`);

    sendResponse(res, 200, true, { alerts }, "Alerts fetched successfully");

  } catch (error) {
    console.error('❌ Admin get alerts error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch alerts", error.message);
  }
});

// POST /admin/signals/alerts/:id/dismiss - Dismiss an alert
router.post('/alerts/:id/dismiss', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🚨 Admin dismissing alert: ${id}`);

    // In a real implementation, you would store dismissed alerts
    // For now, we'll just acknowledge the dismissal

    console.log(`✅ Admin alert dismissed: ${id}`);

    sendResponse(res, 200, true, {
      alertId: id,
      dismissedAt: new Date(),
      dismissedBy: req.user.uid
    }, "Alert dismissed successfully");

  } catch (error) {
    console.error('❌ Admin dismiss alert error:', error);
    sendResponse(res, 500, false, null, null, "Failed to dismiss alert", error.message);
  }
});

// GET /admin/signals/health - Get system health status
router.get('/health', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('🏥 Admin checking system health...');

    // Perform health checks
    const healthChecks = {
      database: 'healthy',
      storage: 'healthy',
      api: 'healthy',
      memory: 'healthy',
      disk: 'healthy'
    };

    // Mock some health data
    const healthData = {
      status: 'healthy',
      checks: healthChecks,
      uptime: process.uptime(),
      timestamp: new Date(),
      metrics: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform
      }
    };

    console.log('✅ Admin system health checked successfully');

    sendResponse(res, 200, true, healthData, "System health checked successfully");

  } catch (error) {
    console.error('❌ Admin health check error:', error);
    sendResponse(res, 500, false, null, null, "Failed to check system health", error.message);
  }
});

module.exports = router;

