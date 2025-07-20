const express = require('express');
const { db } = require('../auth/firebaseConfig');
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

// GET /api/admin/analytics - Get analytics data
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const { range = '7d' } = req.query;
    
    // Get products count
    const productsSnapshot = await db.collection('products').get();
    const totalProducts = productsSnapshot.size;
    
    // Get orders count
    const ordersSnapshot = await db.collection('orders').get();
    const totalOrders = ordersSnapshot.size;
    
    // Get users count
    const usersSnapshot = await db.collection('users').get();
    const totalUsers = usersSnapshot.size;
    
    // Calculate total revenue
    let totalRevenue = 0;
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      if (order.total) {
        totalRevenue += order.total;
      }
    });
    
    // Mock analytics data based on range
    const analyticsData = {
      overview: {
        totalProducts,
        totalOrders,
        totalUsers,
        totalRevenue
      },
      sales: {
        daily: generateMockSalesData(range),
        weekly: generateMockSalesData('weekly'),
        monthly: generateMockSalesData('monthly')
      },
      topProducts: await getTopProducts(),
      recentOrders: await getRecentOrders(),
      userGrowth: generateMockUserGrowth(range)
    };
    
    sendResponse(res, 200, true, analyticsData, "Analytics data retrieved successfully");
  } catch (error) {
    console.error('❌ Analytics error:', error);
    sendResponse(res, 500, false, null, null, "Failed to retrieve analytics data", error.message);
  }
});

// Helper functions
function generateMockSalesData(range) {
  const data = [];
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 7;
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    data.push({
      date: date.toISOString().split('T')[0],
      sales: Math.floor(Math.random() * 5000) + 1000,
      orders: Math.floor(Math.random() * 20) + 5
    });
  }
  
  return data;
}

function generateMockUserGrowth(range) {
  const data = [];
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 7;
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    data.push({
      date: date.toISOString().split('T')[0],
      newUsers: Math.floor(Math.random() * 10) + 1,
      totalUsers: Math.floor(Math.random() * 100) + 200
    });
  }
  
  return data;
}

async function getTopProducts() {
  try {
    const snapshot = await db.collection('products')
      .where('isActive', '==', true)
      .orderBy('rating', 'desc')
      .limit(5)
      .get();
    
    const products = [];
    snapshot.forEach(doc => {
      const product = doc.data();
      products.push({
        id: doc.id,
        name: product.name,
        sales: Math.floor(Math.random() * 100) + 10,
        revenue: product.price * (Math.floor(Math.random() * 100) + 10),
        rating: product.rating || 4.0
      });
    });
    
    return products;
  } catch (error) {
    console.error('Error getting top products:', error);
    return [];
  }
}

async function getRecentOrders() {
  try {
    const snapshot = await db.collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    const orders = [];
    snapshot.forEach(doc => {
      const order = doc.data();
      orders.push({
        id: doc.id,
        ...order,
        createdAt: order.createdAt?.toDate ? order.createdAt.toDate() : order.createdAt
      });
    });
    
    return orders;
  } catch (error) {
    console.error('Error getting recent orders:', error);
    return [];
  }
}

module.exports = router;

