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

// Helper: Generate Order ID
const generateOrderId = () => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

// POST /api/orders/create - Create new order
router.post('/create', verifyAuth, [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Valid quantity is required for each item'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Valid price is required for each item'),
  body('shippingAddress').isObject().withMessage('Shipping address is required'),
  body('shippingAddress.name').notEmpty().withMessage('Recipient name is required'),
  body('shippingAddress.phone').notEmpty().withMessage('Phone number is required'),
  body('shippingAddress.address').notEmpty().withMessage('Address is required'),
  body('shippingAddress.city').notEmpty().withMessage('City is required'),
  body('shippingAddress.state').notEmpty().withMessage('State is required'),
  body('shippingAddress.pincode').notEmpty().withMessage('Pincode is required'),
  body('paymentMethod').isIn(['card', 'upi', 'netbanking', 'cod', 'wallet']).withMessage('Valid payment method is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const {
      items,
      shippingAddress,
      paymentMethod,
      couponCode,
      notes
    } = req.body;

    // Validate products exist and calculate totals
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const productDoc = await db.collection('products').doc(item.productId).get();
      
      if (!productDoc.exists) {
        return sendResponse(res, 400, false, null, null, `Product ${item.productId} not found`);
      }

      const product = productDoc.data();
      
      if (!product.isActive) {
        return sendResponse(res, 400, false, null, null, `Product ${product.name} is not available`);
      }

      if (product.stock < item.quantity) {
        return sendResponse(res, 400, false, null, null, `Insufficient stock for ${product.name}`);
      }

      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        productId: item.productId,
        name: product.name,
        price: item.price,
        quantity: item.quantity,
        total: itemTotal,
        image: product.images?.[0] || '',
        sku: product.sku || ''
      });
    }

    // Calculate order totals
    let discount = 0;
    let couponDetails = null;

    // Apply coupon if provided
    if (couponCode) {
      const couponDoc = await db.collection('coupons').doc(couponCode).get();
      if (couponDoc.exists) {
        const coupon = couponDoc.data();
        if (coupon.isActive && new Date() <= coupon.expiryDate.toDate()) {
          if (subtotal >= coupon.minOrderValue) {
            if (coupon.type === 'percentage') {
              discount = Math.round((subtotal * coupon.discount) / 100);
            } else {
              discount = coupon.discount;
            }
            couponDetails = {
              code: couponCode,
              type: coupon.type,
              discount: coupon.discount,
              appliedDiscount: discount
            };
          }
        }
      }
    }

    const shippingCost = paymentMethod === 'cod' ? 50 : 0;
    const gst = Math.round(((subtotal - discount) * 18) / 100);
    const processingFee = paymentMethod === 'cod' ? 50 : (paymentMethod === 'card' ? 25 : 0);
    const total = subtotal - discount + shippingCost + gst + processingFee;

    const orderId = generateOrderId();

    const orderData = {
      orderId,
      userId: req.user.uid,
      userEmail: req.user.email,
      items: validatedItems,
      shippingAddress,
      paymentMethod,
      coupon: couponDetails,
      pricing: {
        subtotal,
        discount,
        shippingCost,
        gst,
        processingFee,
        total
      },
      status: 'pending',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'awaiting_payment',
      notes: notes || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      trackingNumber: null,
      statusHistory: [{
        status: 'pending',
        timestamp: new Date(),
        note: 'Order placed successfully'
      }]
    };

    const orderRef = await db.collection('orders').add(orderData);

    // Update product stock
    const batch = db.batch();
    for (const item of validatedItems) {
      const productRef = db.collection('products').doc(item.productId);
      batch.update(productRef, {
        stock: admin.firestore.FieldValue.increment(-item.quantity),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();

    // Update user's order history
    const userRef = db.collection('users').doc(req.user.uid);
    await userRef.update({
      orderHistory: admin.firestore.FieldValue.arrayUnion(orderRef.id),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 201, true, {
      orderId: orderRef.id,
      orderNumber: orderId,
      total,
      status: 'pending',
      paymentStatus: orderData.paymentStatus
    }, "Order created successfully");

  } catch (error) {
    console.error('❌ Create order error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create order", error.message);
  }
});

// GET /api/orders/:orderId - Get order by ID
router.get('/:orderId', verifyAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderDoc = await db.collection('orders').doc(orderId).get();

    if (!orderDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Order not found");
    }

    const orderData = orderDoc.data();

    // Check if user owns this order or is admin
    if (orderData.userId !== req.user.uid && req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Access denied");
    }

    sendResponse(res, 200, true, {
      order: {
        id: orderDoc.id,
        ...orderData,
        createdAt: orderData.createdAt?.toDate(),
        updatedAt: orderData.updatedAt?.toDate(),
        estimatedDelivery: orderData.estimatedDelivery?.toDate()
      }
    }, "Order fetched successfully");

  } catch (error) {
    console.error('❌ Get order error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch order", error.message);
  }
});

// GET /api/orders - Get user's orders
router.get('/', verifyAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('orders').where('userId', '==', req.user.uid);

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query.orderBy(sortBy, sortOrder);

    const snapshot = await query.get();
    const orders = [];

    snapshot.forEach(doc => {
      const orderData = doc.data();
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
    console.error('❌ Get user orders error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch orders", error.message);
  }
});

// PUT /api/orders/:id/status - Update order status (Admin only)
router.put('/:id/status', verifyAuth, [
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Valid status is required'),
  body('note').optional().isString().withMessage('Note must be a string')
], async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Admin access required");
    }

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

// POST /api/orders/:id/cancel - Cancel order
router.post('/:id/cancel', verifyAuth, [
  body('reason').optional().isString().withMessage('Cancellation reason must be a string')
], async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const orderRef = db.collection('orders').doc(id);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Order not found");
    }

    const orderData = orderDoc.data();

    // Check if user owns this order or is admin
    if (orderData.userId !== req.user.uid && req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Access denied");
    }

    // Check if order can be cancelled
    if (['shipped', 'delivered', 'cancelled'].includes(orderData.status)) {
      return sendResponse(res, 400, false, null, null, "Order cannot be cancelled");
    }

    await orderRef.update({
      status: 'cancelled',
      paymentStatus: 'cancelled',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      cancellationReason: reason || 'Cancelled by user',
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        status: 'cancelled',
        timestamp: new Date(),
        note: reason || 'Order cancelled by user',
        updatedBy: req.user.uid
      })
    });

    // Restore product stock
    const batch = db.batch();
    for (const item of orderData.items) {
      const productRef = db.collection('products').doc(item.productId);
      batch.update(productRef, {
        stock: admin.firestore.FieldValue.increment(item.quantity),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();

    sendResponse(res, 200, true, null, "Order cancelled successfully");

  } catch (error) {
    console.error('❌ Cancel order error:', error);
    sendResponse(res, 500, false, null, null, "Failed to cancel order", error.message);
  }
});

// GET /api/orders/history - Get user's order history (alias for orders)
router.get('/history', verifyAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('orders').where('userId', '==', req.user.uid);

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query.orderBy(sortBy, sortOrder);

    const snapshot = await query.get();
    const orders = [];

    snapshot.forEach(doc => {
      const orderData = doc.data();
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
    }, "Order history fetched successfully");

  } catch (error) {
    console.error('❌ Get order history error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch order history", error.message);
  }
});

// GET /api/orders/:id - Get order details
router.get('/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const orderDoc = await db.collection('orders').doc(id).get();

    if (!orderDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Order not found");
    }

    const orderData = orderDoc.data();

    // Check if user owns this order or is admin
    if (orderData.userId !== req.user.uid && req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Access denied");
    }

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

// GET /api/orders/:id/track - Track order
router.get('/:id/track', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const orderDoc = await db.collection('orders').doc(id).get();

    if (!orderDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Order not found");
    }

    const orderData = orderDoc.data();

    // Check if user owns this order or is admin
    if (orderData.userId !== req.user.uid && req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Access denied");
    }

    const trackingInfo = {
      orderId: orderData.orderId,
      status: orderData.status,
      trackingNumber: orderData.trackingNumber,
      estimatedDelivery: orderData.estimatedDelivery?.toDate(),
      statusHistory: orderData.statusHistory || [],
      shippingAddress: orderData.shippingAddress
    };

    sendResponse(res, 200, true, {
      tracking: trackingInfo
    }, "Order tracking information fetched successfully");

  } catch (error) {
    console.error('❌ Track order error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch tracking information", error.message);
  }
});

module.exports = router;

