// Shipping Routes - Extra API Endpoints
const express = require('express');
const router = express.Router();

// GET /api/shipping/rates - Get shipping rates
router.get('/rates', async (req, res) => {
  try {
    const { destination, weight, dimensions } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        destination,
        weight: parseFloat(weight) || 0.5,
        dimensions,
        rates: [
          {
            id: "standard",
            name: "Standard Shipping",
            description: "5-7 business days",
            price: 5.99,
            estimatedDays: "5-7",
            carrier: "India Post"
          },
          {
            id: "express",
            name: "Express Shipping",
            description: "2-3 business days",
            price: 12.99,
            estimatedDays: "2-3",
            carrier: "FedEx"
          },
          {
            id: "overnight",
            name: "Overnight Shipping",
            description: "Next business day",
            price: 24.99,
            estimatedDays: "1",
            carrier: "DHL Express"
          }
        ],
        freeShippingThreshold: 50.00,
        currency: "USD"
      },
      message: "Shipping rates retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve shipping rates",
      details: error.message
    });
  }
});

// POST /api/shipping/calculate - Calculate shipping cost
router.post('/calculate', async (req, res) => {
  try {
    const { items, destination, shippingMethod } = req.body;
    
    if (!items || !destination) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        details: ["items and destination are required"]
      });
    }
    
    const totalWeight = items.reduce((sum, item) => sum + (item.weight * item.quantity), 0);
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    let shippingCost = 5.99; // Default standard shipping
    if (shippingMethod === 'express') shippingCost = 12.99;
    if (shippingMethod === 'overnight') shippingCost = 24.99;
    
    // Free shipping for orders over $50
    if (subtotal >= 50) shippingCost = 0;
    
    res.status(200).json({
      success: true,
      data: {
        subtotal,
        totalWeight,
        shippingMethod: shippingMethod || 'standard',
        shippingCost,
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        freeShippingApplied: subtotal >= 50,
        total: subtotal + shippingCost
      },
      message: "Shipping cost calculated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to calculate shipping cost",
      details: error.message
    });
  }
});

// GET /api/shipping/zones - Get shipping zones
router.get('/zones', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        zones: [
          {
            id: "domestic",
            name: "Domestic (India)",
            countries: ["IN"],
            baseRate: 5.99,
            freeShippingThreshold: 50.00,
            estimatedDays: "3-5"
          },
          {
            id: "international_asia",
            name: "Asia Pacific",
            countries: ["SG", "MY", "TH", "PH", "ID"],
            baseRate: 15.99,
            freeShippingThreshold: 100.00,
            estimatedDays: "7-10"
          },
          {
            id: "international_europe",
            name: "Europe",
            countries: ["GB", "DE", "FR", "IT", "ES"],
            baseRate: 25.99,
            freeShippingThreshold: 150.00,
            estimatedDays: "10-14"
          },
          {
            id: "international_americas",
            name: "Americas",
            countries: ["US", "CA", "MX", "BR"],
            baseRate: 29.99,
            freeShippingThreshold: 200.00,
            estimatedDays: "12-16"
          }
        ]
      },
      message: "Shipping zones retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve shipping zones",
      details: error.message
    });
  }
});

// POST /api/shipping/track - Track shipment
router.post('/track', async (req, res) => {
  try {
    const { trackingNumber, carrier } = req.body;
    
    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        error: "Tracking number is required"
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        trackingNumber,
        carrier: carrier || "India Post",
        status: "in_transit",
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        currentLocation: "Mumbai Distribution Center",
        trackingHistory: [
          {
            status: "shipped",
            location: "Delhi Warehouse",
            timestamp: "2025-01-18T10:00:00Z",
            description: "Package shipped from warehouse"
          },
          {
            status: "in_transit",
            location: "Delhi Hub",
            timestamp: "2025-01-18T14:30:00Z",
            description: "Package in transit to destination city"
          },
          {
            status: "in_transit",
            location: "Mumbai Distribution Center",
            timestamp: "2025-01-19T08:15:00Z",
            description: "Package arrived at distribution center"
          }
        ]
      },
      message: "Shipment tracking retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to track shipment",
      details: error.message
    });
  }
});

// GET /api/shipping/carriers - Get available carriers
router.get('/carriers', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        carriers: [
          {
            id: "india_post",
            name: "India Post",
            services: ["standard", "express"],
            trackingSupported: true,
            internationalShipping: true
          },
          {
            id: "fedex",
            name: "FedEx",
            services: ["express", "overnight"],
            trackingSupported: true,
            internationalShipping: true
          },
          {
            id: "dhl",
            name: "DHL Express",
            services: ["express", "overnight"],
            trackingSupported: true,
            internationalShipping: true
          },
          {
            id: "ups",
            name: "UPS",
            services: ["standard", "express"],
            trackingSupported: true,
            internationalShipping: true
          },
          {
            id: "aramex",
            name: "Aramex",
            services: ["standard", "express"],
            trackingSupported: true,
            internationalShipping: true
          }
        ]
      },
      message: "Carriers retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve carriers",
      details: error.message
    });
  }
});

// POST /api/shipping/label - Generate shipping label
router.post('/label', async (req, res) => {
  try {
    const { orderId, shippingAddress, items, shippingMethod } = req.body;
    
    if (!orderId || !shippingAddress || !items) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        details: ["orderId, shippingAddress, and items are required"]
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        labelId: `LBL-${Date.now()}`,
        orderId,
        trackingNumber: `TRK${Date.now()}`,
        carrier: "India Post",
        shippingMethod: shippingMethod || "standard",
        labelUrl: `https://api.fragransia.com/labels/LBL-${Date.now()}.pdf`,
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        cost: 5.99,
        createdAt: new Date()
      },
      message: "Shipping label generated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to generate shipping label",
      details: error.message
    });
  }
});

module.exports = router;

