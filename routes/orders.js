const express = require("express");
const router = express.Router(); // ✅ Define router here
const { body, validationResult } = require("express-validator");
const crypto = require("crypto");
const verifyAuth = require("../middleware/authMiddleware");
const { db, admin } = require("../auth/firebaseConfig");

// Create new order
router.post("/create", verifyAuth, [
  body("items").isArray({ min: 1 }).withMessage("Items array is required"),
  body("items.*.productId").notEmpty().withMessage("Product ID is required"),
  body("items.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
  body("shippingAddress").isObject().withMessage("Shipping address is required"),
  body("shippingAddress.firstName").notEmpty().withMessage("First name is required"),
  body("shippingAddress.lastName").notEmpty().withMessage("Last name is required"),
  body("shippingAddress.address").notEmpty().withMessage("Address is required"),
  body("shippingAddress.city").notEmpty().withMessage("City is required"),
  body("shippingAddress.pincode").notEmpty().withMessage("Pincode is required"),
  body("shippingAddress.phone").notEmpty().withMessage("Phone is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array()
      });
    }

    const { items, shippingAddress, couponCode, giftWrap, notes } = req.body;
    const userId = req.user.uid;

    // Validate and calculate order total
    let orderTotal = 0;
    let shippingCost = process.env.DEFAULT_SHIPPING_COST || 50; // Base shipping cost
    const processedItems = [];

    for (const item of items) {
      const productDoc = await db.collection("products").doc(item.productId).get();
      
      if (!productDoc.exists) {
        return res.status(404).json({
          error: "Product not found",
          productId: item.productId
        });
      }

      const product = productDoc.data();
      
      if (!product.isActive) {
        return res.status(400).json({
          error: "Product not available",
          productId: item.productId,
          productName: product.name
        });
      }

      // Check inventory
      if (product.inventory < item.quantity) {
        return res.status(400).json({
          error: "Insufficient inventory",
          productId: item.productId,
          productName: product.name,
          available: product.inventory,
          requested: item.quantity
        });
      }

      const itemTotal = product.price * item.quantity;
      orderTotal += itemTotal;

      processedItems.push({
        productId: item.productId,
        name: product.name,
        brand: product.brand,
        price: product.price,
        quantity: item.quantity,
        size: item.size || product.defaultSize || product.size || "100ml",
        image: product.images?.[0] || "",
        total: itemTotal
      });
    }

    // Apply free shipping threshold
    if (orderTotal >= 500) {
      shippingCost = 0;
    }

    // Apply coupon if provided
    let discountAmount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      const couponDoc = await db.collection("coupons").doc(couponCode.toUpperCase()).get();
      
      if (couponDoc.exists) {
        const coupon = couponDoc.data();
        
        if (coupon.isActive && new Date() <= coupon.expiryDate.toDate()) {
          if (coupon.type === "percentage") {
            discountAmount = (orderTotal * coupon.value) / 100;
            if (coupon.maxDiscount) {
              discountAmount = Math.min(discountAmount, coupon.maxDiscount);
            }
          } else if (coupon.type === "fixed") {
            discountAmount = Math.min(coupon.value, orderTotal);
          }

          appliedCoupon = {
            code: couponCode.toUpperCase(),
            type: coupon.type,
            value: coupon.value,
            discountAmount
          };
        }
      }
    }

    const finalTotal = orderTotal + shippingCost - discountAmount;

    // Generate order ID
    const orderId = "ORD_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

    // Create Razorpay order (mock implementation)
    const razorpayOrderId = "rzp_" + Math.random().toString(36).substr(2, 14);

    // Create order document
    const orderData = {
      orderId,
      userId,
      items: processedItems,
      shippingAddress,
      orderSummary: {
        subtotal: orderTotal,
        shippingCost,
        discountAmount,
        finalTotal
      },
      appliedCoupon,
      giftWrap: giftWrap || null,
      notes: notes || "",
      razorpayOrderId,
      status: "pending",
      paymentStatus: "pending",
      trackingNumber: null,
      estimatedDelivery: new Date(Date.now() + (process.env.DEFAULT_DELIVERY_DAYS || 5) * 24 * 60 * 60 * 1000), // 5 days from now
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("orders").doc(orderId).set(orderData);

    // Emit real-time update to admin
    // req.io.to("admin").emit("new-order", {
    //   orderId,
    //   userId,
    //   total: finalTotal,
    //   itemCount: processedItems.length,
    //   createdAt: new Date()
    // });

    res.status(201).json({
      success: true,
      order: {
        orderId,
        razorpayOrderId,
        amount: finalTotal,
        currency: "INR",
        items: processedItems,
        shippingAddress,
        orderSummary: orderData.orderSummary
      }
    });

  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      error: "Failed to create order",
      message: error.message
    });
  }
});

// Get order by ID
router.get("/:orderId", verifyAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.uid;

    const orderDoc = await db.collection("orders").doc(orderId).get();

    if (!orderDoc.exists) {
      return res.status(404).json({
        error: "Order not found",
        message: "The requested order does not exist"
      });
    }

    const orderData = orderDoc.data();

    // Check if user owns this order (or is admin)
    if (orderData.userId !== userId && req.user.role !== "admin") {
      return res.status(403).json({
        error: "Access denied",
        message: "You can only view your own orders"
      });
    }

    res.json({
      success: true,
      order: {
        id: orderDoc.id,
        ...orderData,
        createdAt: orderData.createdAt?.toDate(),
        updatedAt: orderData.updatedAt?.toDate(),
        estimatedDelivery: orderData.estimatedDelivery?.toDate()
      }
    });

  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({
      error: "Failed to fetch order",
      message: error.message
    });
  }
});

// Get user's orders
router.get("/user/list", verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { limit = 10, page = 1, status } = req.query;

    let query = db.collection("orders")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc");

    if (status) {
      query = query.where("status", "==", status);
    }

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    if (offset > 0) {
      const offsetSnapshot = await query.limit(offset).get();
      if (!offsetSnapshot.empty) {
        const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
        query = query.startAfter(lastDoc);
      }
    }

    query = query.limit(parseInt(limit));
    const snapshot = await query.get();

    const orders = [];
    snapshot.forEach(doc => {
      const orderData = doc.data();
      orders.push({
        id: doc.id,
        orderId: orderData.orderId,
        status: orderData.status,
        paymentStatus: orderData.paymentStatus,
        orderSummary: orderData.orderSummary,
        itemCount: orderData.items.length,
        createdAt: orderData.createdAt?.toDate(),
        estimatedDelivery: orderData.estimatedDelivery?.toDate()
      });
    });

    // Get total count
    let countQuery = db.collection("orders").where("userId", "==", userId);
    if (status) {
      countQuery = countQuery.where("status", "==", status);
    }
    const countSnapshot = await countQuery.get();
    const totalOrders = countSnapshot.size;
    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalOrders,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error("Get user orders error:", error);
    res.status(500).json({
      error: "Failed to fetch orders",
      message: error.message
    });
  }
});

// Cancel order
router.post("/:orderId/cancel", verifyAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user.uid;

    const orderDoc = await db.collection("orders").doc(orderId).get();

    if (!orderDoc.exists) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    const orderData = orderDoc.data();

    // Check if user owns this order
    if (orderData.userId !== userId) {
      return res.status(403).json({
        error: "Access denied",
        message: "You can only cancel your own orders"
      });
    }

    // Check if order can be cancelled
    if (!["pending", "confirmed"].includes(orderData.status)) {
      return res.status(400).json({
        error: "Cannot cancel order",
        message: "Order cannot be cancelled in current status"
      });
    }

    // Update order status
    await db.collection("orders").doc(orderId).update({
      status: "cancelled",
      cancellationReason: reason || "Cancelled by customer",
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Restore inventory
    const batch = db.batch();
    for (const item of orderData.items) {
      const productRef = db.collection("products").doc(item.productId);
      batch.update(productRef, {
        inventory: admin.firestore.FieldValue.increment(item.quantity)
      });
    }
    await batch.commit();

    // Emit real-time update
    // req.io.to("admin").emit("order-cancelled", {
    //   orderId,
    //   userId,
    //   reason: reason || "Cancelled by customer"
    // });

    // req.io.to(`user-${userId}`).emit("order-status-updated", {
    //   orderId,
    //   status: "cancelled"
    // });

    res.json({
      success: true,
      message: "Order cancelled successfully"
    });

  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({
      error: "Failed to cancel order",
      message: error.message
    });
  }
});

// Track order
router.get("/:orderId/track", async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderDoc = await db.collection("orders").doc(orderId).get();

    if (!orderDoc.exists) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    const orderData = orderDoc.data();

    // Mock tracking data
    const trackingSteps = [
      {
        status: "Order Placed",
        description: "Your order has been placed successfully",
        timestamp: orderData.createdAt?.toDate(),
        completed: true
      },
      {
        status: "Order Confirmed",
        description: "Your order has been confirmed and is being prepared",
        timestamp: orderData.status === "confirmed" ? orderData.updatedAt?.toDate() : null,
        completed: ["confirmed", "processing", "shipped", "delivered"].includes(orderData.status)
      },
      {
        status: "Processing",
        description: "Your order is being processed and packed",
        timestamp: orderData.status === "processing" ? orderData.updatedAt?.toDate() : null,
        completed: ["processing", "shipped", "delivered"].includes(orderData.status)
      },
      {
        status: "Shipped",
        description: "Your order has been shipped",
        timestamp: orderData.status === "shipped" ? orderData.updatedAt?.toDate() : null,
        completed: ["shipped", "delivered"].includes(orderData.status)
      },
      {
        status: "Delivered",
        description: "Your order has been delivered",
        timestamp: orderData.status === "delivered" ? orderData.updatedAt?.toDate() : null,
        completed: orderData.status === "delivered"
      }
    ];

    res.json({
      success: true,
      tracking: {
        orderId: orderData.orderId,
        status: orderData.status,
        trackingNumber: orderData.trackingNumber,
        estimatedDelivery: orderData.estimatedDelivery?.toDate(),
        steps: trackingSteps
      }
    });

  } catch (error) {
    console.error("Track order error:", error);
    res.status(500).json({
      error: "Failed to track order",
      message: error.message
    });
  }
});

module.exports = router;


