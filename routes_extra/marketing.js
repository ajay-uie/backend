// Marketing Routes - Extra API Endpoints
const express = require('express');
const router = express.Router();

// GET /api/marketing/campaigns - Get marketing campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        campaigns: [
          {
            id: 1,
            name: "Summer Sale 2025",
            type: "email",
            status: "active",
            subject: "Get 30% Off All Summer Fragrances",
            description: "Promote summer fragrance collection with discount",
            startDate: "2025-06-01",
            endDate: "2025-08-31",
            targetAudience: "all_customers",
            budget: 5000,
            spent: 2340,
            impressions: 45000,
            clicks: 2250,
            conversions: 180,
            revenue: 9000,
            createdAt: "2025-05-15T10:00:00Z"
          },
          {
            id: 2,
            name: "New Customer Welcome",
            type: "automated",
            status: "active",
            subject: "Welcome to Fragransia - 15% Off Your First Order",
            description: "Welcome series for new customers",
            startDate: "2025-01-01",
            endDate: null,
            targetAudience: "new_customers",
            budget: 2000,
            spent: 890,
            impressions: 12000,
            clicks: 960,
            conversions: 145,
            revenue: 4350,
            createdAt: "2024-12-20T09:00:00Z"
          },
          {
            id: 3,
            name: "Valentine's Day Special",
            type: "social_media",
            status: "completed",
            subject: "Perfect Fragrances for Your Valentine",
            description: "Valentine's Day themed campaign",
            startDate: "2025-02-01",
            endDate: "2025-02-14",
            targetAudience: "couples",
            budget: 3000,
            spent: 2850,
            impressions: 78000,
            clicks: 3900,
            conversions: 312,
            revenue: 15600,
            createdAt: "2025-01-15T14:30:00Z"
          }
        ],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 15,
          pages: 1
        },
        summary: {
          active: 8,
          completed: 5,
          draft: 2,
          total: 15,
          totalBudget: 25000,
          totalSpent: 18500,
          totalRevenue: 125000
        }
      },
      message: "Marketing campaigns retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve marketing campaigns",
      details: error.message
    });
  }
});

// POST /api/marketing/campaigns - Create marketing campaign
router.post('/campaigns', async (req, res) => {
  try {
    const { 
      name, 
      type, 
      subject, 
      description, 
      startDate, 
      endDate, 
      targetAudience, 
      budget,
      content 
    } = req.body;
    
    if (!name || !type || !subject || !targetAudience) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        details: ["name", "type", "subject", "targetAudience are required"]
      });
    }
    
    const campaign = {
      id: Date.now(),
      name,
      type,
      subject,
      description,
      startDate,
      endDate,
      targetAudience,
      budget: budget || 0,
      spent: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      status: "draft",
      content,
      createdAt: new Date()
    };
    
    res.status(201).json({
      success: true,
      data: { campaign },
      message: "Marketing campaign created successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to create marketing campaign",
      details: error.message
    });
  }
});

// GET /api/marketing/campaigns/:id - Get specific campaign
router.get('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    res.status(200).json({
      success: true,
      data: {
        campaign: {
          id: parseInt(id),
          name: "Summer Sale 2025",
          type: "email",
          status: "active",
          subject: "Get 30% Off All Summer Fragrances",
          description: "Promote summer fragrance collection with discount",
          startDate: "2025-06-01",
          endDate: "2025-08-31",
          targetAudience: "all_customers",
          budget: 5000,
          spent: 2340,
          impressions: 45000,
          clicks: 2250,
          conversions: 180,
          revenue: 9000,
          content: {
            html: "<h1>Summer Sale</h1><p>Get 30% off all fragrances!</p>",
            text: "Summer Sale - Get 30% off all fragrances!"
          },
          createdAt: "2025-05-15T10:00:00Z"
        },
        analytics: {
          openRate: 0.25,
          clickRate: 0.05,
          conversionRate: 0.08,
          roi: 3.85,
          unsubscribeRate: 0.002
        }
      },
      message: "Marketing campaign retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve marketing campaign",
      details: error.message
    });
  }
});

// PUT /api/marketing/campaigns/:id - Update campaign
router.put('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    res.status(200).json({
      success: true,
      data: {
        campaignId: parseInt(id),
        updates,
        updatedAt: new Date()
      },
      message: "Marketing campaign updated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update marketing campaign",
      details: error.message
    });
  }
});

// POST /api/marketing/campaigns/:id/send - Send campaign
router.post('/campaigns/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const { sendNow = false, scheduledTime } = req.body;
    
    res.status(200).json({
      success: true,
      data: {
        campaignId: parseInt(id),
        status: sendNow ? "sent" : "scheduled",
        sentAt: sendNow ? new Date() : null,
        scheduledFor: scheduledTime || null,
        recipientCount: 1250
      },
      message: sendNow ? "Campaign sent successfully" : "Campaign scheduled successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to send campaign",
      details: error.message
    });
  }
});

// GET /api/marketing/segments - Get customer segments
router.get('/segments', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        segments: [
          {
            id: "all_customers",
            name: "All Customers",
            description: "All registered customers",
            count: 1250,
            criteria: {}
          },
          {
            id: "new_customers",
            name: "New Customers",
            description: "Customers who registered in the last 30 days",
            count: 156,
            criteria: { registeredWithin: "30d" }
          },
          {
            id: "vip_customers",
            name: "VIP Customers",
            description: "Customers with lifetime value > $500",
            count: 89,
            criteria: { lifetimeValue: { gt: 500 } }
          },
          {
            id: "inactive_customers",
            name: "Inactive Customers",
            description: "Customers who haven't purchased in 90 days",
            count: 234,
            criteria: { lastPurchase: { lt: "90d" } }
          },
          {
            id: "men_fragrance_buyers",
            name: "Men's Fragrance Buyers",
            description: "Customers who bought men's fragrances",
            count: 567,
            criteria: { purchasedCategory: "mens_fragrances" }
          }
        ]
      },
      message: "Customer segments retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve customer segments",
      details: error.message
    });
  }
});

// GET /api/marketing/analytics - Get marketing analytics
router.get('/analytics', async (req, res) => {
  try {
    const { period = '30d', campaignId } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        period,
        campaignId,
        overview: {
          totalCampaigns: 15,
          activeCampaigns: 8,
          totalBudget: 25000,
          totalSpent: 18500,
          totalRevenue: 125000,
          roi: 6.76
        },
        performance: {
          impressions: 450000,
          clicks: 22500,
          conversions: 1800,
          clickRate: 0.05,
          conversionRate: 0.08,
          costPerClick: 0.82,
          costPerConversion: 10.28
        },
        channels: [
          { channel: "email", impressions: 200000, clicks: 10000, conversions: 800, revenue: 40000 },
          { channel: "social_media", impressions: 180000, clicks: 9000, conversions: 720, revenue: 36000 },
          { channel: "google_ads", impressions: 70000, clicks: 3500, conversions: 280, revenue: 14000 }
        ],
        trends: [
          { date: "2025-01-01", impressions: 15000, clicks: 750, conversions: 60 },
          { date: "2025-01-02", impressions: 18000, clicks: 900, conversions: 72 },
          { date: "2025-01-03", impressions: 16500, clicks: 825, conversions: 66 }
        ]
      },
      message: "Marketing analytics retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve marketing analytics",
      details: error.message
    });
  }
});

// GET /api/marketing/templates - Get email templates
router.get('/templates', async (req, res) => {
  try {
    const { category } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        templates: [
          {
            id: 1,
            name: "Welcome Email",
            category: "welcome",
            subject: "Welcome to Fragransia!",
            description: "Welcome new customers with discount offer",
            thumbnail: "/templates/welcome-thumb.jpg",
            createdAt: "2025-01-01T00:00:00Z"
          },
          {
            id: 2,
            name: "Sale Announcement",
            category: "promotional",
            subject: "Big Sale - Up to 50% Off!",
            description: "Announce sales and special offers",
            thumbnail: "/templates/sale-thumb.jpg",
            createdAt: "2025-01-01T00:00:00Z"
          },
          {
            id: 3,
            name: "Order Confirmation",
            category: "transactional",
            subject: "Your Order Confirmation",
            description: "Confirm customer orders",
            thumbnail: "/templates/order-thumb.jpg",
            createdAt: "2025-01-01T00:00:00Z"
          },
          {
            id: 4,
            name: "Abandoned Cart",
            category: "retention",
            subject: "Don't Forget Your Items",
            description: "Recover abandoned shopping carts",
            thumbnail: "/templates/cart-thumb.jpg",
            createdAt: "2025-01-01T00:00:00Z"
          }
        ],
        categories: ["welcome", "promotional", "transactional", "retention", "newsletter"]
      },
      message: "Email templates retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve email templates",
      details: error.message
    });
  }
});

module.exports = router;

