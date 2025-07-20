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

// GET /admin/analytics - Get analytics data
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { range = '7d' } = req.query;

    console.log(`📊 Admin fetching analytics for range: ${range}`);

    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (range) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get analytics data
    const [
      totalProducts,
      totalOrders,
      totalUsers,
      totalRevenue,
      recentOrders,
      topProducts,
      userGrowth
    ] = await Promise.all([
      // Total products
      db.collection('products').where('isActive', '==', true).get(),
      
      // Total orders in range
      db.collection('orders')
        .where('createdAt', '>=', startDate)
        .where('createdAt', '<=', now)
        .get(),
      
      // Total users
      db.collection('users').get(),
      
      // Calculate revenue (mock data for now)
      Promise.resolve(0),
      
      // Recent orders
      db.collection('orders')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get(),
      
      // Top products (mock data)
      Promise.resolve([]),
      
      // User growth (mock data)
      Promise.resolve([])
    ]);

    // Calculate revenue from orders
    let revenue = 0;
    totalOrders.forEach(doc => {
      const orderData = doc.data();
      revenue += orderData.total || 0;
    });

    // Process recent orders
    const recentOrdersData = [];
    recentOrders.forEach(doc => {
      const orderData = doc.data();
      recentOrdersData.push({
        id: doc.id,
        ...orderData,
        createdAt: orderData.createdAt?.toDate()
      });
    });

    // Mock top products data
    const topProductsData = [
      { name: 'Premium Perfume', sales: 45, revenue: 13500 },
      { name: 'Body Spray Collection', sales: 32, revenue: 9600 },
      { name: 'Luxury Gift Set', sales: 28, revenue: 14000 },
      { name: 'Deodorant Pack', sales: 25, revenue: 5000 }
    ];

    // Mock user growth data
    const userGrowthData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      userGrowthData.push({
        date: date.toISOString().split('T')[0],
        users: Math.floor(Math.random() * 20) + 10
      });
    }

    const analyticsData = {
      overview: {
        totalProducts: totalProducts.size,
        totalOrders: totalOrders.size,
        totalUsers: totalUsers.size,
        totalRevenue: revenue,
        averageOrderValue: totalOrders.size > 0 ? Math.round(revenue / totalOrders.size) : 0
      },
      recentOrders: recentOrdersData,
      topProducts: topProductsData,
      userGrowth: userGrowthData,
      salesTrend: [
        { date: '2025-01-14', sales: 1200 },
        { date: '2025-01-15', sales: 1800 },
        { date: '2025-01-16', sales: 1500 },
        { date: '2025-01-17', sales: 2200 },
        { date: '2025-01-18', sales: 1900 },
        { date: '2025-01-19', sales: 2500 },
        { date: '2025-01-20', sales: 2100 }
      ],
      categoryBreakdown: [
        { category: 'Perfumes', percentage: 45, value: revenue * 0.45 },
        { category: 'Body Sprays', percentage: 30, value: revenue * 0.30 },
        { category: 'Deodorants', percentage: 15, value: revenue * 0.15 },
        { category: 'Gift Sets', percentage: 10, value: revenue * 0.10 }
      ]
    };

    console.log(`✅ Admin analytics fetched successfully`);

    sendResponse(res, 200, true, analyticsData, "Analytics data fetched successfully");

  } catch (error) {
    console.error('❌ Admin analytics error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch analytics data", error.message);
  }
});

// GET /admin/analytics/dashboard - Get dashboard summary
router.get('/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('📊 Admin fetching dashboard summary...');

    // Get basic counts
    const [productsSnapshot, ordersSnapshot, usersSnapshot] = await Promise.all([
      db.collection('products').get(),
      db.collection('orders').get(),
      db.collection('users').get()
    ]);

    // Calculate today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayOrdersSnapshot = await db.collection('orders')
      .where('createdAt', '>=', today)
      .where('createdAt', '<', tomorrow)
      .get();

    let todayRevenue = 0;
    todayOrdersSnapshot.forEach(doc => {
      const orderData = doc.data();
      todayRevenue += orderData.total || 0;
    });

    const dashboardData = {
      totalProducts: productsSnapshot.size,
      totalOrders: ordersSnapshot.size,
      totalUsers: usersSnapshot.size,
      todayOrders: todayOrdersSnapshot.size,
      todayRevenue,
      activeProducts: productsSnapshot.docs.filter(doc => doc.data().isActive).length,
      pendingOrders: ordersSnapshot.docs.filter(doc => doc.data().status === 'pending').length,
      lowStockProducts: productsSnapshot.docs.filter(doc => {
        const data = doc.data();
        return data.stock < 10;
      }).length
    };

    console.log('✅ Admin dashboard summary fetched successfully');

    sendResponse(res, 200, true, dashboardData, "Dashboard summary fetched successfully");

  } catch (error) {
    console.error('❌ Admin dashboard error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch dashboard summary", error.message);
  }
});

module.exports = router;

