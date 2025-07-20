// Analytics Routes - Extra API Endpoints
const express = require('express');
const router = express.Router();

// GET /api/analytics/dashboard - Dashboard analytics
router.get('/dashboard', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        totalUsers: 1250,
        totalOrders: 3420,
        totalRevenue: 125000,
        totalProducts: 89,
        monthlyGrowth: 15.2,
        topProducts: [
          { id: 1, name: "Amber Oud", sales: 145 },
          { id: 2, name: "Blue Man", sales: 132 },
          { id: 3, name: "Ocean Breeze", sales: 98 }
        ],
        recentActivity: [
          { type: "order", message: "New order #1234", timestamp: new Date() },
          { type: "user", message: "New user registered", timestamp: new Date() },
          { type: "product", message: "Product updated", timestamp: new Date() }
        ]
      },
      message: "Dashboard analytics retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve dashboard analytics",
      details: error.message
    });
  }
});

// GET /api/analytics/sales - Sales analytics
router.get('/sales', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        period,
        totalSales: 45230,
        totalOrders: 892,
        averageOrderValue: 50.7,
        salesByDay: [
          { date: '2025-01-01', sales: 1250, orders: 25 },
          { date: '2025-01-02', sales: 1890, orders: 38 },
          { date: '2025-01-03', sales: 2100, orders: 42 }
        ],
        topCategories: [
          { category: "Men's Fragrances", sales: 18500, percentage: 40.9 },
          { category: "Women's Fragrances", sales: 15200, percentage: 33.6 },
          { category: "Unisex Fragrances", sales: 11530, percentage: 25.5 }
        ]
      },
      message: "Sales analytics retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve sales analytics",
      details: error.message
    });
  }
});

// GET /api/analytics/users - User analytics
router.get('/users', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        totalUsers: 1250,
        activeUsers: 892,
        newUsersThisMonth: 156,
        userGrowthRate: 12.4,
        usersByLocation: [
          { country: "India", users: 650, percentage: 52 },
          { country: "USA", users: 200, percentage: 16 },
          { country: "UK", users: 150, percentage: 12 },
          { country: "Others", users: 250, percentage: 20 }
        ],
        userActivity: {
          dailyActiveUsers: 245,
          weeklyActiveUsers: 678,
          monthlyActiveUsers: 892
        }
      },
      message: "User analytics retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve user analytics",
      details: error.message
    });
  }
});

// GET /api/analytics/products - Product analytics
router.get('/products', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        totalProducts: 89,
        activeProducts: 85,
        outOfStock: 4,
        lowStock: 12,
        topSellingProducts: [
          { id: 1, name: "Amber Oud", sales: 145, revenue: 7250 },
          { id: 2, name: "Blue Man", sales: 132, revenue: 6600 },
          { id: 3, name: "Ocean Breeze", sales: 98, revenue: 4900 }
        ],
        categoryPerformance: [
          { category: "Men's Fragrances", products: 35, sales: 450 },
          { category: "Women's Fragrances", products: 32, sales: 380 },
          { category: "Unisex Fragrances", products: 22, sales: 290 }
        ]
      },
      message: "Product analytics retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve product analytics",
      details: error.message
    });
  }
});

// GET /api/analytics/revenue - Revenue analytics
router.get('/revenue', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        period,
        totalRevenue: 125000,
        netProfit: 37500,
        profitMargin: 30,
        revenueGrowth: 15.2,
        revenueByMonth: [
          { month: 'Jan', revenue: 42000, profit: 12600 },
          { month: 'Feb', revenue: 38500, profit: 11550 },
          { month: 'Mar', revenue: 44500, profit: 13350 }
        ],
        revenueStreams: [
          { source: "Direct Sales", revenue: 87500, percentage: 70 },
          { source: "Affiliate", revenue: 25000, percentage: 20 },
          { source: "Wholesale", revenue: 12500, percentage: 10 }
        ]
      },
      message: "Revenue analytics retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve revenue analytics",
      details: error.message
    });
  }
});

module.exports = router;

