const express = require('express');
const { realtimeDb, db } = require('../auth/firebaseConfig');
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

// GET /realtime/analytics - Get real-time analytics data
router.get('/analytics', adminMiddleware, async (req, res) => {
  try {
    // Get analytics from real-time database
    const analyticsSnapshot = await realtimeDb.ref('analytics').once('value');
    const analyticsData = analyticsSnapshot.val() || {
      visitors: 0,
      pageViews: 0,
      orders: 0,
      revenue: 0,
      users: 0,
      products: 0
    };

    // Get additional data from Firestore
    const [usersSnapshot, productsSnapshot, ordersSnapshot] = await Promise.all([
      db.collection('users').get(),
      db.collection('products').get(),
      db.collection('orders').get()
    ]);

    // Calculate real-time metrics
    let totalRevenue = 0;
    let todayOrders = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      totalRevenue += order.total || 0;
      
      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      if (orderDate >= today) {
        todayOrders++;
      }
    });

    // Get product categories distribution
    const categoryStats = {};
    productsSnapshot.forEach(doc => {
      const product = doc.data();
      if (product.category) {
        categoryStats[product.category] = (categoryStats[product.category] || 0) + 1;
      }
    });

    // Get user registration trends (last 7 days)
    const userTrends = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      let count = 0;
      usersSnapshot.forEach(doc => {
        const user = doc.data();
        const userDate = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
        if (userDate >= date && userDate < nextDate) {
          count++;
        }
      });
      
      userTrends.push({
        date: date.toISOString().split('T')[0],
        users: count
      });
    }

    const realTimeData = {
      ...analyticsData,
      users: usersSnapshot.size,
      products: productsSnapshot.size,
      orders: ordersSnapshot.size,
      revenue: totalRevenue,
      todayOrders,
      categoryStats,
      userTrends,
      lastUpdated: new Date().toISOString()
    };

    // Update real-time database with current stats
    await realtimeDb.ref('analytics').update({
      users: usersSnapshot.size,
      products: productsSnapshot.size,
      orders: ordersSnapshot.size,
      revenue: totalRevenue,
      lastUpdated: Date.now()
    });

    sendResponse(res, 200, true, realTimeData, "Real-time analytics retrieved successfully");

  } catch (error) {
    console.error('❌ Get real-time analytics error:', error);
    sendResponse(res, 500, false, null, null, "Failed to get real-time analytics", error.message);
  }
});

// POST /realtime/analytics/track - Track user activity
router.post('/analytics/track', async (req, res) => {
  try {
    const { event, data } = req.body;

    console.log(`📊 Tracking event: ${event}`, data);

    // Update real-time analytics based on event type
    switch (event) {
      case 'page_view':
        await realtimeDb.ref('analytics/pageViews').transaction((current) => {
          return (current || 0) + 1;
        });
        break;
        
      case 'visitor':
        await realtimeDb.ref('analytics/visitors').transaction((current) => {
          return (current || 0) + 1;
        });
        break;
        
      case 'product_view':
        await realtimeDb.ref(`analytics/productViews/${data.productId}`).transaction((current) => {
          return (current || 0) + 1;
        });
        break;
        
      case 'add_to_cart':
        await realtimeDb.ref('analytics/cartAdditions').transaction((current) => {
          return (current || 0) + 1;
        });
        break;
        
      case 'purchase':
        await realtimeDb.ref('analytics/purchases').transaction((current) => {
          return (current || 0) + 1;
        });
        if (data.amount) {
          await realtimeDb.ref('analytics/revenue').transaction((current) => {
            return (current || 0) + data.amount;
          });
        }
        break;
    }

    // Update last activity timestamp
    await realtimeDb.ref('analytics/lastActivity').set(Date.now());

    sendResponse(res, 200, true, null, "Event tracked successfully");

  } catch (error) {
    console.error('❌ Track analytics error:', error);
    sendResponse(res, 500, false, null, null, "Failed to track event", error.message);
  }
});

// GET /realtime/notifications - Get user notifications
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Get user notifications from real-time database
    const notificationsSnapshot = await realtimeDb.ref(`notifications/users/${userId}`).once('value');
    const notifications = notificationsSnapshot.val() || {};

    // Convert to array and sort by timestamp
    const notificationArray = Object.keys(notifications).map(key => ({
      id: key,
      ...notifications[key]
    })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    sendResponse(res, 200, true, notificationArray, "Notifications retrieved successfully");

  } catch (error) {
    console.error('❌ Get notifications error:', error);
    sendResponse(res, 500, false, null, null, "Failed to get notifications", error.message);
  }
});

// POST /realtime/notifications - Send notification to user
router.post('/notifications', adminMiddleware, async (req, res) => {
  try {
    const { userId, title, message, type = 'info', data = {} } = req.body;

    const notification = {
      title,
      message,
      type,
      data,
      timestamp: Date.now(),
      read: false
    };

    // Add notification to user's notifications
    const notificationRef = await realtimeDb.ref(`notifications/users/${userId}`).push(notification);

    // Also add to admin notifications for tracking
    await realtimeDb.ref('notifications/admin').push({
      ...notification,
      userId,
      notificationId: notificationRef.key
    });

    sendResponse(res, 201, true, { 
      id: notificationRef.key, 
      ...notification 
    }, "Notification sent successfully");

  } catch (error) {
    console.error('❌ Send notification error:', error);
    sendResponse(res, 500, false, null, null, "Failed to send notification", error.message);
  }
});

// PUT /realtime/notifications/:id/read - Mark notification as read
router.put('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.uid;

    await realtimeDb.ref(`notifications/users/${userId}/${id}/read`).set(true);
    await realtimeDb.ref(`notifications/users/${userId}/${id}/readAt`).set(Date.now());

    sendResponse(res, 200, true, null, "Notification marked as read");

  } catch (error) {
    console.error('❌ Mark notification read error:', error);
    sendResponse(res, 500, false, null, null, "Failed to mark notification as read", error.message);
  }
});

// DELETE /realtime/notifications/:id - Delete notification
router.delete('/notifications/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.uid;

    await realtimeDb.ref(`notifications/users/${userId}/${id}`).remove();

    sendResponse(res, 200, true, null, "Notification deleted successfully");

  } catch (error) {
    console.error('❌ Delete notification error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete notification", error.message);
  }
});

// GET /realtime/live-stats - Get live website statistics
router.get('/live-stats', adminMiddleware, async (req, res) => {
  try {
    // Get current online users (simplified - in production you'd track this properly)
    const onlineUsersSnapshot = await realtimeDb.ref('presence').once('value');
    const onlineUsers = onlineUsersSnapshot.val() || {};
    const onlineCount = Object.keys(onlineUsers).length;

    // Get recent activity
    const recentActivitySnapshot = await realtimeDb.ref('activity').limitToLast(10).once('value');
    const recentActivity = [];
    
    recentActivitySnapshot.forEach(child => {
      recentActivity.unshift({
        id: child.key,
        ...child.val()
      });
    });

    // Get current cart abandonment data
    const cartsSnapshot = await db.collection('carts').where('status', '==', 'abandoned').get();
    const abandonedCarts = cartsSnapshot.size;

    const liveStats = {
      onlineUsers: onlineCount,
      recentActivity,
      abandonedCarts,
      timestamp: Date.now()
    };

    sendResponse(res, 200, true, liveStats, "Live statistics retrieved successfully");

  } catch (error) {
    console.error('❌ Get live stats error:', error);
    sendResponse(res, 500, false, null, null, "Failed to get live statistics", error.message);
  }
});

// POST /realtime/presence - Update user presence
router.post('/presence', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { status = 'online', page } = req.body;

    const presenceData = {
      userId,
      status,
      page,
      lastSeen: Date.now(),
      userAgent: req.headers['user-agent'] || 'Unknown'
    };

    await realtimeDb.ref(`presence/${userId}`).set(presenceData);

    // Set up automatic cleanup after 5 minutes of inactivity
    setTimeout(async () => {
      try {
        await realtimeDb.ref(`presence/${userId}`).remove();
      } catch (error) {
        console.error('Error cleaning up presence:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    sendResponse(res, 200, true, null, "Presence updated successfully");

  } catch (error) {
    console.error('❌ Update presence error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update presence", error.message);
  }
});

module.exports = router;

