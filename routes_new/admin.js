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

// Middleware to verify admin access
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return sendResponse(res, 403, false, null, null, "Admin access required");
  }
  next();
};

// GET /api/admin/dashboard - Get dashboard statistics
router.get('/dashboard', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    // Get various statistics
    const [
      usersSnapshot,
      ordersSnapshot,
      productsSnapshot,
      revenueSnapshot
    ] = await Promise.all([
      db.collection('users').get(),
      db.collection('orders').get(),
      db.collection('products').get(),
      db.collection('orders').where('paymentStatus', '==', 'paid').get()
    ]);

    const totalUsers = usersSnapshot.size;
    const totalOrders = ordersSnapshot.size;
    const totalProducts = productsSnapshot.size;

    // Calculate revenue
    let totalRevenue = 0;
    revenueSnapshot.forEach(doc => {
      const order = doc.data();
      totalRevenue += order.pricing?.total || 0;
    });

    // Get recent orders
    const recentOrdersSnapshot = await db.collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    const recentOrders = [];
    recentOrdersSnapshot.forEach(doc => {
      const orderData = doc.data();
      recentOrders.push({
        id: doc.id,
        orderId: orderData.orderId,
        userEmail: orderData.userEmail,
        total: orderData.pricing?.total || 0,
        status: orderData.status,
        createdAt: orderData.createdAt?.toDate()
      });
    });

    // Get order status distribution
    const orderStatusCounts = {};
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      const status = order.status || 'unknown';
      orderStatusCounts[status] = (orderStatusCounts[status] || 0) + 1;
    });

    sendResponse(res, 200, true, {
      statistics: {
        totalUsers,
        totalOrders,
        totalProducts,
        totalRevenue: Math.round(totalRevenue * 100) / 100
      },
      recentOrders,
      orderStatusDistribution: orderStatusCounts
    }, "Dashboard data fetched successfully");

  } catch (error) {
    console.error('❌ Get dashboard error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch dashboard data", error.message);
  }
});

// GET /api/admin/analytics - Get analytics data
router.get('/analytics', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get orders in date range
    const ordersSnapshot = await db.collection('orders')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();

    const orders = [];
    ordersSnapshot.forEach(doc => {
      const orderData = doc.data();
      orders.push({
        ...orderData,
        createdAt: orderData.createdAt?.toDate()
      });
    });

    // Calculate daily sales
    const dailySales = {};
    orders.forEach(order => {
      if (order.paymentStatus === 'paid') {
        const date = order.createdAt.toISOString().split('T')[0];
        if (!dailySales[date]) {
          dailySales[date] = { revenue: 0, orders: 0 };
        }
        dailySales[date].revenue += order.pricing?.total || 0;
        dailySales[date].orders += 1;
      }
    });

    // Get top products
    const productSales = {};
    orders.forEach(order => {
      if (order.paymentStatus === 'paid') {
        order.items?.forEach(item => {
          if (!productSales[item.productId]) {
            productSales[item.productId] = {
              name: item.name,
              quantity: 0,
              revenue: 0
            };
          }
          productSales[item.productId].quantity += item.quantity;
          productSales[item.productId].revenue += item.total;
        });
      }
    });

    const topProducts = Object.entries(productSales)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    sendResponse(res, 200, true, {
      period,
      dateRange: { startDate, endDate },
      dailySales,
      topProducts,
      summary: {
        totalOrders: orders.length,
        paidOrders: orders.filter(o => o.paymentStatus === 'paid').length,
        totalRevenue: orders
          .filter(o => o.paymentStatus === 'paid')
          .reduce((sum, o) => sum + (o.pricing?.total || 0), 0)
      }
    }, "Analytics data fetched successfully");

  } catch (error) {
    console.error('❌ Get analytics error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch analytics data", error.message);
  }
});

// GET /api/admin/users - Get all users
router.get('/users', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;

    let query = db.collection('users');

    if (status) {
      query = query.where('isActive', '==', status === 'active');
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();
    let users = [];

    snapshot.forEach(doc => {
      const userData = doc.data();
      
      // Apply search filter
      if (search) {
        const searchTerm = search.toLowerCase();
        const nameMatch = `${userData.firstName} ${userData.lastName}`.toLowerCase().includes(searchTerm);
        const emailMatch = userData.email?.toLowerCase().includes(searchTerm);
        if (!nameMatch && !emailMatch) return;
      }

      // Remove sensitive information
      const { password, ...safeUserData } = userData;
      
      users.push({
        id: doc.id,
        ...safeUserData,
        createdAt: userData.createdAt?.toDate(),
        updatedAt: userData.updatedAt?.toDate(),
        lastLogin: userData.lastLogin?.toDate()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedUsers = users.slice(startIndex, endIndex);

    const totalUsers = users.length;
    const totalPages = Math.ceil(totalUsers / parseInt(limit));

    sendResponse(res, 200, true, {
      users: paginatedUsers,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalUsers,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    }, "Users fetched successfully");

  } catch (error) {
    console.error('❌ Get users error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch users", error.message);
  }
});

// GET /api/admin/orders - Get all orders
router.get('/orders', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    let query = db.collection('orders');

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();
    let orders = [];

    snapshot.forEach(doc => {
      const orderData = doc.data();
      
      // Apply search filter
      if (search) {
        const searchTerm = search.toLowerCase();
        const orderIdMatch = orderData.orderId?.toLowerCase().includes(searchTerm);
        const emailMatch = orderData.userEmail?.toLowerCase().includes(searchTerm);
        if (!orderIdMatch && !emailMatch) return;
      }

      orders.push({
        id: doc.id,
        ...orderData,
        createdAt: orderData.createdAt?.toDate(),
        updatedAt: orderData.updatedAt?.toDate(),
        estimatedDelivery: orderData.estimatedDelivery?.toDate()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrders = orders.slice(startIndex, endIndex);

    const totalOrders = orders.length;
    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    sendResponse(res, 200, true, {
      orders: paginatedOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalOrders,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    }, "Orders fetched successfully");

  } catch (error) {
    console.error('❌ Get orders error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch orders", error.message);
  }
});

// PUT /api/admin/orders/:id/status - Update order status
router.put('/orders/:id/status', verifyAuth, verifyAdmin, [
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Valid status is required'),
  body('note').optional().isString().withMessage('Note must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { id } = req.params;
    const { status, note, trackingNumber } = req.body;

    const orderRef = db.collection('orders').doc(id);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Order not found");
    }

    const orderData = orderDoc.data();
    const statusUpdate = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        status,
        timestamp: new Date(),
        note: note || `Order status updated to ${status}`,
        updatedBy: req.user.uid
      })
    };

    if (trackingNumber) {
      statusUpdate.trackingNumber = trackingNumber;
    }

    // Update payment status based on order status
    if (status === 'confirmed' && orderData.paymentStatus === 'awaiting_payment') {
      statusUpdate.paymentStatus = 'paid';
    } else if (status === 'cancelled') {
      statusUpdate.paymentStatus = 'cancelled';
    }

    await orderRef.update(statusUpdate);

    const updatedDoc = await orderRef.get();
    const updatedData = updatedDoc.data();

    sendResponse(res, 200, true, {
      order: {
        id: updatedDoc.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate(),
        estimatedDelivery: updatedData.estimatedDelivery?.toDate()
      }
    }, "Order status updated successfully");

  } catch (error) {
    console.error('❌ Update order status error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update order status", error.message);
  }
});

// GET /api/admin/orders/:id - Get order details
router.get('/orders/:id', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const orderDoc = await db.collection('orders').doc(id).get();

    if (!orderDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Order not found");
    }

    const orderData = orderDoc.data();

    sendResponse(res, 200, true, {
      order: {
        id: orderDoc.id,
        ...orderData,
        createdAt: orderData.createdAt?.toDate(),
        updatedAt: orderData.updatedAt?.toDate(),
        estimatedDelivery: orderData.estimatedDelivery?.toDate()
      }
    }, "Order details fetched successfully");

  } catch (error) {
    console.error('❌ Get order details error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch order details", error.message);
  }
});

// GET /api/admin/products - Get all products for admin
router.get('/products', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, status } = req.query;

    let query = db.collection('products');

    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    if (status) {
      query = query.where('isActive', '==', status === 'active');
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();
    let products = [];

    snapshot.forEach(doc => {
      const productData = doc.data();
      
      // Apply search filter
      if (search) {
        const searchTerm = search.toLowerCase();
        const nameMatch = productData.name?.toLowerCase().includes(searchTerm);
        const brandMatch = productData.brand?.toLowerCase().includes(searchTerm);
        if (!nameMatch && !brandMatch) return;
      }

      products.push({
        id: doc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedProducts = products.slice(startIndex, endIndex);

    const totalProducts = products.length;
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    sendResponse(res, 200, true, {
      products: paginatedProducts,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    }, "Products fetched successfully");

  } catch (error) {
    console.error('❌ Get admin products error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch products", error.message);
  }
});

// POST /api/admin/products - Create new product
router.post('/products', verifyAuth, verifyAdmin, [
  body('name').notEmpty().withMessage('Product name is required'),
  body('brand').notEmpty().withMessage('Brand is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('description').notEmpty().withMessage('Description is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const productData = {
      ...req.body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      isFeatured: req.body.isFeatured !== undefined ? req.body.isFeatured : false
    };

    const docRef = await db.collection('products').add(productData);
    const newDoc = await docRef.get();
    const newData = newDoc.data();

    sendResponse(res, 201, true, {
      product: {
        id: newDoc.id,
        ...newData,
        createdAt: newData.createdAt?.toDate(),
        updatedAt: newData.updatedAt?.toDate()
      }
    }, "Product created successfully");

  } catch (error) {
    console.error('❌ Create product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create product", error.message);
  }
});

// PUT /api/admin/products/:id - Update product
router.put('/products/:id', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const productRef = db.collection('products').doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await productRef.update(updateData);

    const updatedDoc = await productRef.get();
    const updatedData = updatedDoc.data();

    sendResponse(res, 200, true, {
      product: {
        id: updatedDoc.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate()
      }
    }, "Product updated successfully");

  } catch (error) {
    console.error('❌ Update product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update product", error.message);
  }
});

// DELETE /api/admin/products/:id - Delete product
router.delete('/products/:id', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const productRef = db.collection('products').doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    await productRef.delete();

    sendResponse(res, 200, true, null, "Product deleted successfully");

  } catch (error) {
    console.error('❌ Delete product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete product", error.message);
  }
});

// PUT /api/admin/products/bulk - Bulk update products
router.put('/products/bulk', verifyAuth, verifyAdmin, [
  body('productIds').isArray().withMessage('Product IDs must be an array'),
  body('updates').isObject().withMessage('Updates must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { productIds, updates } = req.body;

    const batch = db.batch();
    const updateData = {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    productIds.forEach(id => {
      const productRef = db.collection('products').doc(id);
      batch.update(productRef, updateData);
    });

    await batch.commit();

    sendResponse(res, 200, true, null, `${productIds.length} products updated successfully`);

  } catch (error) {
    console.error('❌ Bulk update products error:', error);
    sendResponse(res, 500, false, null, null, "Failed to bulk update products", error.message);
  }
});

// POST /api/admin/products/upload-image - Upload product image
router.post('/products/upload-image', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    // This is a placeholder for image upload functionality
    // In a real implementation, you would handle file upload here
    // using multer or similar middleware and upload to cloud storage

    const { productId, imageUrl, imageType = 'main' } = req.body;

    if (!productId || !imageUrl) {
      return sendResponse(res, 400, false, null, null, "Product ID and image URL are required");
    }

    const productRef = db.collection('products').doc(productId);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const productData = productDoc.data();
    const images = productData.images || [];

    if (imageType === 'main') {
      images.unshift(imageUrl); // Add as first image
    } else {
      images.push(imageUrl);
    }

    await productRef.update({
      images,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 200, true, { imageUrl, images }, "Image uploaded successfully");

  } catch (error) {
    console.error('❌ Upload image error:', error);
    sendResponse(res, 500, false, null, null, "Failed to upload image", error.message);
  }
});

// GET /api/admin/coupons - Get all coupons
router.get('/coupons', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    let query = db.collection('coupons');

    if (status) {
      query = query.where('isActive', '==', status === 'active');
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();
    let coupons = [];

    snapshot.forEach(doc => {
      const couponData = doc.data();
      
      // Apply search filter
      if (search) {
        const searchTerm = search.toLowerCase();
        const codeMatch = couponData.code?.toLowerCase().includes(searchTerm);
        const nameMatch = couponData.name?.toLowerCase().includes(searchTerm);
        if (!codeMatch && !nameMatch) return;
      }

      coupons.push({
        id: doc.id,
        ...couponData,
        createdAt: couponData.createdAt?.toDate(),
        updatedAt: couponData.updatedAt?.toDate(),
        validFrom: couponData.validFrom?.toDate(),
        validUntil: couponData.validUntil?.toDate()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedCoupons = coupons.slice(startIndex, endIndex);

    const totalCoupons = coupons.length;
    const totalPages = Math.ceil(totalCoupons / parseInt(limit));

    sendResponse(res, 200, true, {
      coupons: paginatedCoupons,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCoupons,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    }, "Coupons fetched successfully");

  } catch (error) {
    console.error('❌ Get admin coupons error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch coupons", error.message);
  }
});

// POST /api/admin/coupons - Create new coupon
router.post('/coupons', verifyAuth, verifyAdmin, [
  body('code').notEmpty().withMessage('Coupon code is required'),
  body('name').notEmpty().withMessage('Coupon name is required'),
  body('discountType').isIn(['percentage', 'fixed']).withMessage('Valid discount type is required'),
  body('discountValue').isNumeric().withMessage('Discount value must be a number'),
  body('validFrom').isISO8601().withMessage('Valid from date is required'),
  body('validUntil').isISO8601().withMessage('Valid until date is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    // Check if coupon code already exists
    const existingCoupon = await db.collection('coupons').where('code', '==', req.body.code).get();
    if (!existingCoupon.empty) {
      return sendResponse(res, 400, false, null, null, "Coupon code already exists");
    }

    const couponData = {
      ...req.body,
      validFrom: admin.firestore.Timestamp.fromDate(new Date(req.body.validFrom)),
      validUntil: admin.firestore.Timestamp.fromDate(new Date(req.body.validUntil)),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      usageCount: 0
    };

    const docRef = await db.collection('coupons').add(couponData);
    const newDoc = await docRef.get();
    const newData = newDoc.data();

    sendResponse(res, 201, true, {
      coupon: {
        id: newDoc.id,
        ...newData,
        createdAt: newData.createdAt?.toDate(),
        updatedAt: newData.updatedAt?.toDate(),
        validFrom: newData.validFrom?.toDate(),
        validUntil: newData.validUntil?.toDate()
      }
    }, "Coupon created successfully");

  } catch (error) {
    console.error('❌ Create coupon error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create coupon", error.message);
  }
});

// PUT /api/admin/coupons/:id - Update coupon
router.put('/coupons/:id', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const couponRef = db.collection('coupons').doc(id);
    const couponDoc = await couponRef.get();

    if (!couponDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Coupon not found");
    }

    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Handle date fields
    if (req.body.validFrom) {
      updateData.validFrom = admin.firestore.Timestamp.fromDate(new Date(req.body.validFrom));
    }
    if (req.body.validUntil) {
      updateData.validUntil = admin.firestore.Timestamp.fromDate(new Date(req.body.validUntil));
    }

    await couponRef.update(updateData);

    const updatedDoc = await couponRef.get();
    const updatedData = updatedDoc.data();

    sendResponse(res, 200, true, {
      coupon: {
        id: updatedDoc.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate(),
        validFrom: updatedData.validFrom?.toDate(),
        validUntil: updatedData.validUntil?.toDate()
      }
    }, "Coupon updated successfully");

  } catch (error) {
    console.error('❌ Update coupon error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update coupon", error.message);
  }
});

// DELETE /api/admin/coupons/:id - Delete coupon
router.delete('/coupons/:id', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const couponRef = db.collection('coupons').doc(id);
    const couponDoc = await couponRef.get();

    if (!couponDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Coupon not found");
    }

    await couponRef.delete();

    sendResponse(res, 200, true, null, "Coupon deleted successfully");

  } catch (error) {
    console.error('❌ Delete coupon error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete coupon", error.message);
  }
});

// GET /api/admin/settings - Get admin settings
router.get('/settings', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    // Mock settings (in production, fetch from database)
    const settings = {
      site: {
        name: "Fragransia",
        description: "Premium Fragrance Store",
        logo: "/logo.png",
        favicon: "/favicon.ico"
      },
      shipping: {
        freeShippingThreshold: 500,
        standardShippingCost: 50,
        codFee: 50
      },
      payment: {
        acceptedMethods: ['card', 'upi', 'netbanking', 'cod', 'wallet'],
        processingFees: {
          card: 25,
          upi: 0,
          netbanking: 15,
          cod: 50,
          wallet: 0
        }
      },
      tax: {
        gstRate: 18,
        includeInPrice: false
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true
      }
    };

    sendResponse(res, 200, true, { settings }, "Settings fetched successfully");

  } catch (error) {
    console.error('❌ Get settings error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch settings", error.message);
  }
});

module.exports = router;

