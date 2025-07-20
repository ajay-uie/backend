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

// POST /api/payments/create-intent - Create payment intent
router.post('/create-intent', verifyAuth, [
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount is required'),
  body('currency').optional().isIn(['INR', 'USD']).withMessage('Valid currency is required'),
  body('orderId').notEmpty().withMessage('Order ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { amount, currency = 'INR', orderId } = req.body;
    const userId = req.user.uid;

    // Verify order exists and belongs to user
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Order not found");
    }

    const orderData = orderDoc.data();
    if (orderData.userId !== userId) {
      return sendResponse(res, 403, false, null, null, "Access denied");
    }

    // Create payment intent (mock for development)
    const paymentIntent = {
      id: `pi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      amount: Math.round(amount * 100), // Convert to smallest currency unit
      currency: currency.toLowerCase(),
      status: 'requires_payment_method',
      clientSecret: `pi_${Date.now()}_secret_${Math.random().toString(36).substring(2, 8)}`,
      orderId,
      userId,
      createdAt: new Date()
    };

    // Store payment intent
    await db.collection('payment_intents').doc(paymentIntent.id).set(paymentIntent);

    sendResponse(res, 200, true, {
      paymentIntent: {
        id: paymentIntent.id,
        clientSecret: paymentIntent.clientSecret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      }
    }, "Payment intent created successfully");

  } catch (error) {
    console.error('❌ Create payment intent error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create payment intent", error.message);
  }
});

// POST /api/payments/verify - Verify payment
router.post('/verify', verifyAuth, [
  body('paymentIntentId').notEmpty().withMessage('Payment intent ID is required'),
  body('paymentMethodId').optional().isString().withMessage('Payment method ID must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { paymentIntentId, paymentMethodId } = req.body;
    const userId = req.user.uid;

    // Get payment intent
    const paymentIntentDoc = await db.collection('payment_intents').doc(paymentIntentId).get();
    if (!paymentIntentDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Payment intent not found");
    }

    const paymentIntentData = paymentIntentDoc.data();
    if (paymentIntentData.userId !== userId) {
      return sendResponse(res, 403, false, null, null, "Access denied");
    }

    // Mock payment verification (in production, verify with payment provider)
    const isPaymentSuccessful = Math.random() > 0.1; // 90% success rate for demo

    if (isPaymentSuccessful) {
      // Update payment intent status
      await db.collection('payment_intents').doc(paymentIntentId).update({
        status: 'succeeded',
        paymentMethodId: paymentMethodId || 'pm_mock_success',
        updatedAt: new Date()
      });

      // Update order payment status
      if (paymentIntentData.orderId) {
        await db.collection('orders').doc(paymentIntentData.orderId).update({
          paymentStatus: 'paid',
          status: 'confirmed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          statusHistory: admin.firestore.FieldValue.arrayUnion({
            status: 'confirmed',
            timestamp: new Date(),
            note: 'Payment confirmed'
          })
        });
      }

      sendResponse(res, 200, true, {
        payment: {
          id: paymentIntentId,
          status: 'succeeded',
          amount: paymentIntentData.amount,
          currency: paymentIntentData.currency
        }
      }, "Payment verified successfully");

    } else {
      // Payment failed
      await db.collection('payment_intents').doc(paymentIntentId).update({
        status: 'payment_failed',
        updatedAt: new Date()
      });

      sendResponse(res, 400, false, null, null, "Payment verification failed");
    }

  } catch (error) {
    console.error('❌ Verify payment error:', error);
    sendResponse(res, 500, false, null, null, "Failed to verify payment", error.message);
  }
});

// POST /api/payments/refund - Process refund
router.post('/refund', verifyAuth, [
  body('paymentIntentId').notEmpty().withMessage('Payment intent ID is required'),
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Valid refund amount is required'),
  body('reason').optional().isString().withMessage('Refund reason must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { paymentIntentId, amount, reason } = req.body;
    const userId = req.user.uid;

    // Get payment intent
    const paymentIntentDoc = await db.collection('payment_intents').doc(paymentIntentId).get();
    if (!paymentIntentDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Payment intent not found");
    }

    const paymentIntentData = paymentIntentDoc.data();

    // Check if user owns this payment or is admin
    if (paymentIntentData.userId !== userId && req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Access denied");
    }

    if (paymentIntentData.status !== 'succeeded') {
      return sendResponse(res, 400, false, null, null, "Payment cannot be refunded");
    }

    const refundAmount = amount || paymentIntentData.amount;
    if (refundAmount > paymentIntentData.amount) {
      return sendResponse(res, 400, false, null, null, "Refund amount cannot exceed payment amount");
    }

    // Create refund record
    const refund = {
      id: `re_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      paymentIntentId,
      amount: refundAmount,
      currency: paymentIntentData.currency,
      reason: reason || 'Requested by customer',
      status: 'succeeded',
      createdAt: new Date(),
      processedBy: userId
    };

    await db.collection('refunds').doc(refund.id).set(refund);

    // Update payment intent
    await db.collection('payment_intents').doc(paymentIntentId).update({
      refundedAmount: admin.firestore.FieldValue.increment(refundAmount),
      updatedAt: new Date()
    });

    sendResponse(res, 200, true, {
      refund: {
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status
      }
    }, "Refund processed successfully");

  } catch (error) {
    console.error('❌ Process refund error:', error);
    sendResponse(res, 500, false, null, null, "Failed to process refund", error.message);
  }
});

// GET /api/payments/methods - Get user's payment methods
router.get('/methods', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Mock payment methods (in production, fetch from payment provider)
    const paymentMethods = [
      {
        id: 'pm_card_visa',
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2025
        },
        isDefault: true
      },
      {
        id: 'pm_upi_gpay',
        type: 'upi',
        upi: {
          vpa: 'user@gpay'
        },
        isDefault: false
      }
    ];

    sendResponse(res, 200, true, {
      paymentMethods
    }, "Payment methods fetched successfully");

  } catch (error) {
    console.error('❌ Get payment methods error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch payment methods", error.message);
  }
});

module.exports = router;

