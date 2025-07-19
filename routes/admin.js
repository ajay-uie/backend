const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const { db, admin } = require('../auth/firebaseConfig');

// Dashboard overview
router.get("/dashboard", async (req, res) => {
  try {
    const productsSnapshot = await db.collection("products").get();
    const ordersSnapshot = await db.collection("orders").get();
    const usersSnapshot = await db.collection("users").get();

    const totalProducts = productsSnapshot.size;
    const totalOrders = ordersSnapshot.size;
    const totalUsers = usersSnapshot.size;

    res.json({
      success: true,
      data: {
        totalProducts,
        totalOrders,
        totalUsers,
        totalRevenue: 0, // Placeholder
        pendingOrders: 0, // Placeholder
        lowStockProducts: 0, // Placeholder
        recentOrders: [], // Placeholder
        topProducts: [] // Placeholder
      }
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch dashboard data" });
  }
});

// Products CRUD
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, status } = req.query;
    let query = db.collection('products');

    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    if (status && status !== 'all') {
      query = query.where('active', '==', status === 'active');
    }

    const snapshot = await query.get();
    let products = [];
    
    snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      products = products.filter(product =>
        product.name.toLowerCase().includes(searchLower) ||
        product.brand.toLowerCase().includes(searchLower) ||
        product.sku.toLowerCase().includes(searchLower)
      );
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedProducts = products.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      success: true,
      data: {
        products: paginatedProducts,
        total: products.length,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// Create product
router.post('/products', upload.array('images', 4), async (req, res) => {
  try {
    const {
      name,
      brand,
      category,
      sku,
      price,
      stock,
      weight,
      description,
      tags,
      featured,
      active
    } = req.body;

    const newProduct = {
      name,
      brand,
      category,
      sku,
      price: parseFloat(price),
      stock: parseInt(stock),
      weight: parseFloat(weight),
      description,
      tags: typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags || [],
      images: req.files ? req.files.map(file => `/uploads/${file.filename}`) : [],
      featured: featured === 'true',
      active: active === 'true',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await db.collection('products').add(newProduct);

    // ✅ Trigger real-time update
    if (global.socketServer) {
      global.socketServer.triggerProductUpdate({
        id: docRef.id,
        ...newProduct
      });
    }

    res.json({
      success: true,
      data: { id: docRef.id, ...newProduct },
      message: 'Product created successfully'
    });
  } catch (error) {
    console.error('Product creation error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Update product
router.put('/products/:id', upload.array('images', 4), async (req, res) => {
  try {
    const productId = req.params.id;
    const productRef = db.collection('products').doc(productId);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const {
      name,
      brand,
      category,
      sku,
      price,
      stock,
      weight,
      description,
      tags,
      featured,
      active
    } = req.body;

    const updatedProduct = {
      name,
      brand,
      category,
      sku,
      price: parseFloat(price),
      stock: parseInt(stock),
      weight: parseFloat(weight),
      description,
      tags: typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags || [],
      featured: featured === 'true',
      active: active === 'true',
      updatedAt: new Date().toISOString()
    };

    // Add new images if uploaded
    if (req.files && req.files.length > 0) {
      updatedProduct.images = req.files.map(file => `/uploads/${file.filename}`);
    }

    await productRef.update(updatedProduct);

    // ✅ Trigger real-time update
    if (global.socketServer) {
      global.socketServer.triggerProductUpdate({
        id: productId,
        ...updatedProduct
      });
    }

    res.json({
      success: true,
      data: { id: productId, ...updatedProduct },
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Delete product
router.delete('/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const productRef = db.collection('products').doc(productId);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    await productRef.delete();

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Orders management
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    let query = db.collection('orders');

    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();
    const orders = [];
    
    snapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedOrders = orders.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      success: true,
      data: {
        orders: paginatedOrders,
        total: orders.length,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

// Update order status
router.put('/orders/:id/status', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    await orderRef.update({
      status,
      updatedAt: new Date().toISOString()
    });

    // ✅ Trigger real-time update
    if (global.socketServer) {
      const orderData = orderDoc.data();
      global.socketServer.triggerOrderUpdate({
        id: orderId,
        ...orderData,
        status,
        updatedAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Order status update error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Users management
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
    const users = [];
    
    snapshot.forEach(doc => {
      const userData = doc.data();
      // Don't expose sensitive data
      delete userData.password;
      users.push({ id: doc.id, ...userData });
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedUsers = users.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      success: true,
      data: {
        users: paginatedUsers,
        total: users.length,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// Coupons management
router.get('/coupons', async (req, res) => {
  try {
    const snapshot = await db.collection('coupons').get();
    const coupons = [];
    
    snapshot.forEach(doc => {
      coupons.push({ id: doc.id, ...doc.data() });
    });

    res.json({
      success: true,
      data: { coupons }
    });
  } catch (error) {
    console.error('Coupons fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch coupons' });
  }
});

// Create coupon
router.post('/coupons', async (req, res) => {
  try {
    const {
      code,
      name,
      description,
      type,
      value,
      minimumAmount,
      maximumDiscount,
      usageLimit,
      startDate,
      endDate,
      isActive
    } = req.body;

    const newCoupon = {
      code: code.toUpperCase(),
      name,
      description,
      type,
      value: parseFloat(value),
      minimumAmount: parseFloat(minimumAmount),
      maximumDiscount: parseFloat(maximumDiscount),
      usageLimit: parseInt(usageLimit),
      usedCount: 0,
      startDate,
      endDate,
      isActive: isActive === 'true',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await db.collection('coupons').add(newCoupon);

    res.json({
      success: true,
      data: { id: docRef.id, ...newCoupon },
      message: 'Coupon created successfully'
    });
  } catch (error) {
    console.error('Coupon creation error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

