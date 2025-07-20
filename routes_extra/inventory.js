// Inventory Routes - Extra API Endpoints
const express = require('express');
const router = express.Router();

// GET /api/inventory - Get inventory overview
router.get('/', async (req, res) => {
  try {
    const { category, status, page = 1, limit = 20 } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        inventory: [
          {
            id: 1,
            productId: 101,
            productName: "Amber Oud",
            sku: "AMB-OUD-50ML",
            category: "Men's Fragrances",
            currentStock: 45,
            minStock: 10,
            maxStock: 100,
            status: "in_stock",
            lastRestocked: "2025-01-15",
            supplier: "Fragrance Suppliers Ltd",
            cost: 25.00,
            sellingPrice: 50.00
          },
          {
            id: 2,
            productId: 102,
            productName: "Blue Man",
            sku: "BLU-MAN-50ML",
            category: "Men's Fragrances",
            currentStock: 8,
            minStock: 10,
            maxStock: 80,
            status: "low_stock",
            lastRestocked: "2025-01-10",
            supplier: "Premium Scents Co",
            cost: 22.00,
            sellingPrice: 45.00
          },
          {
            id: 3,
            productId: 103,
            productName: "Ocean Breeze",
            sku: "OCN-BRZ-50ML",
            category: "Unisex Fragrances",
            currentStock: 0,
            minStock: 15,
            maxStock: 90,
            status: "out_of_stock",
            lastRestocked: "2024-12-20",
            supplier: "Ocean Fragrances",
            cost: 28.00,
            sellingPrice: 55.00
          }
        ],
        summary: {
          totalProducts: 89,
          inStock: 75,
          lowStock: 10,
          outOfStock: 4,
          totalValue: 125000
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 89,
          pages: 5
        }
      },
      message: "Inventory retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve inventory",
      details: error.message
    });
  }
});

// GET /api/inventory/:id - Get specific inventory item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    res.status(200).json({
      success: true,
      data: {
        id: parseInt(id),
        productId: 101,
        productName: "Amber Oud",
        sku: "AMB-OUD-50ML",
        category: "Men's Fragrances",
        currentStock: 45,
        minStock: 10,
        maxStock: 100,
        status: "in_stock",
        lastRestocked: "2025-01-15",
        supplier: "Fragrance Suppliers Ltd",
        cost: 25.00,
        sellingPrice: 50.00,
        stockHistory: [
          { date: "2025-01-15", type: "restock", quantity: 50, note: "Regular restock" },
          { date: "2025-01-10", type: "sale", quantity: -5, note: "Order #1234" },
          { date: "2025-01-08", type: "sale", quantity: -3, note: "Order #1230" }
        ],
        alerts: [
          { type: "info", message: "Stock level is healthy" }
        ]
      },
      message: "Inventory item retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve inventory item",
      details: error.message
    });
  }
});

// PUT /api/inventory/:id - Update inventory item
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { currentStock, minStock, maxStock, cost, sellingPrice } = req.body;
    
    res.status(200).json({
      success: true,
      data: {
        id: parseInt(id),
        currentStock,
        minStock,
        maxStock,
        cost,
        sellingPrice,
        updatedAt: new Date()
      },
      message: "Inventory item updated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update inventory item",
      details: error.message
    });
  }
});

// POST /api/inventory/:id/restock - Restock inventory item
router.post('/:id/restock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, supplier, cost, note } = req.body;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid quantity",
        details: ["Quantity must be greater than 0"]
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        inventoryId: parseInt(id),
        restockQuantity: quantity,
        newStock: 45 + quantity,
        supplier,
        cost,
        note,
        restockedAt: new Date()
      },
      message: "Inventory restocked successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to restock inventory",
      details: error.message
    });
  }
});

// GET /api/inventory/alerts - Get inventory alerts
router.get('/alerts/list', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        alerts: [
          {
            id: 1,
            type: "low_stock",
            productId: 102,
            productName: "Blue Man",
            currentStock: 8,
            minStock: 10,
            severity: "warning",
            createdAt: new Date()
          },
          {
            id: 2,
            type: "out_of_stock",
            productId: 103,
            productName: "Ocean Breeze",
            currentStock: 0,
            minStock: 15,
            severity: "critical",
            createdAt: new Date()
          },
          {
            id: 3,
            type: "overstock",
            productId: 104,
            productName: "Rose Garden",
            currentStock: 150,
            maxStock: 100,
            severity: "info",
            createdAt: new Date()
          }
        ],
        summary: {
          critical: 1,
          warning: 1,
          info: 1,
          total: 3
        }
      },
      message: "Inventory alerts retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve inventory alerts",
      details: error.message
    });
  }
});

// GET /api/inventory/reports/stock - Stock report
router.get('/reports/stock', async (req, res) => {
  try {
    const { period = '30d', category } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        period,
        category,
        stockMovement: [
          { date: "2025-01-01", inbound: 100, outbound: 45, net: 55 },
          { date: "2025-01-02", inbound: 0, outbound: 32, net: -32 },
          { date: "2025-01-03", inbound: 75, outbound: 28, net: 47 }
        ],
        topMovingProducts: [
          { productName: "Amber Oud", movement: 145 },
          { productName: "Blue Man", movement: 132 },
          { productName: "Ocean Breeze", movement: 98 }
        ],
        stockTurnover: {
          averageTurnover: 4.2,
          fastMoving: 15,
          slowMoving: 8,
          deadStock: 2
        }
      },
      message: "Stock report generated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to generate stock report",
      details: error.message
    });
  }
});

module.exports = router;

