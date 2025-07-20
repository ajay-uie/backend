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

// POST /api/payments-api/process - Process payment
router.post('/process', verifyAuth, [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Valid amount is required'),
  body('currency').optional().isIn(['INR', 'USD']).withMessage('Valid currency is required'),
  body('paymentMethod').isIn(['card', 'upi', 'netbanking', 'wallet']).withMessage('Valid payment method is required'),
  body('paymentDetails').isObject().withMessage('Payment details are required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const {
      orderId,
      amount,
      currency = 'INR',
      paymentMethod,
      paymentDetails,
      returnUrl,
      cancelUrl
    } = req.body;

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

    if (orderData.paymentStatus === 'paid') {
      return sendResponse(res, 400, false, null, null, "Order is already paid");
    }

    // Generate payment transaction ID
    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create payment record
    const paymentData = {
      transactionId,
      orderId,
      userId,
      amount: parseFloat(amount),
      currency,
      paymentMethod,
      paymentDetails,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('payments').doc(transactionId).set(paymentData);

    // Simulate payment processing based on method
    let paymentResponse;
    
    switch (paymentMethod) {
      case 'card':
        paymentResponse = {
          transactionId,
          status: 'pending',
          redirectUrl: `https://payment-gateway.example.com/card?txn=${transactionId}`,
          message: "Redirecting to card payment gateway"
        };
        break;
        
      case 'upi':
        paymentResponse = {
          transactionId,
          status: 'pending',
          upiUrl: `upi://pay?pa=merchant@upi&pn=Fragransia&am=${amount}&cu=${currency}&tn=${transactionId}`,
          qrCode: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==`,
          message: "Scan QR code or use UPI URL to complete payment"
        };
        break;
        
      case 'netbanking':
        paymentResponse = {
          transactionId,
          status: 'pending',
          redirectUrl: `https://netbanking.example.com/pay?txn=${transactionId}`,
          banks: ['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak'],
          message: "Select your bank to proceed with netbanking"
        };
        break;
        
      case 'wallet':
        paymentResponse = {
          transactionId,
          status: 'pending',
          walletOptions: ['Paytm', 'PhonePe', 'GooglePay', 'AmazonPay'],
          message: "Select your wallet to complete payment"
        };
        break;
        
      default:
        return sendResponse(res, 400, false, null, null, "Unsupported payment method");
    }

    // Update order with payment transaction ID
    await db.collection('orders').doc(orderId).update({
      paymentTransactionId: transactionId,
      paymentStatus: 'processing',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 200, true, {
      payment: paymentResponse,
      orderId,
      amount,
      currency
    }, "Payment processing initiated");

  } catch (error) {
    console.error('❌ Process payment error:', error);
    sendResponse(res, 500, false, null, null, "Failed to process payment", error.message);
  }
});

// POST /api/payments-api/webhook - Payment webhook handler
router.post('/webhook', [
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('status').isIn(['success', 'failed', 'pending']).withMessage('Valid status is required'),
  body('signature').optional().isString().withMessage('Signature must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const {
      transactionId,
      status,
      paymentId,
      signature,
      failureReason,
      gatewayResponse
    } = req.body;

    // Verify webhook signature (in production, verify with actual gateway signature)
    // This is a placeholder verification
    const isValidSignature = true; // You would implement actual signature verification

    if (!isValidSignature) {
      return sendResponse(res, 401, false, null, null, "Invalid webhook signature");
    }

    // Get payment record
    const paymentDoc = await db.collection('payments').doc(transactionId).get();
    if (!paymentDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Payment transaction not found");
    }

    const paymentData = paymentDoc.data();

    // Update payment status
    const updateData = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (paymentId) updateData.gatewayPaymentId = paymentId;
    if (signature) updateData.gatewaySignature = signature;
    if (failureReason) updateData.failureReason = failureReason;
    if (gatewayResponse) updateData.gatewayResponse = gatewayResponse;

    await db.collection('payments').doc(transactionId).update(updateData);

    // Update order status based on payment status
    const orderUpdateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (status === 'success') {
      orderUpdateData.paymentStatus = 'paid';
      orderUpdateData.status = 'confirmed';
      orderUpdateData.paidAt = admin.firestore.FieldValue.serverTimestamp();
      
      // Add to status history
      orderUpdateData.statusHistory = admin.firestore.FieldValue.arrayUnion({
        status: 'confirmed',
        timestamp: new Date(),
        note: 'Payment successful',
        automated: true
      });
    } else if (status === 'failed') {
      orderUpdateData.paymentStatus = 'failed';
      orderUpdateData.status = 'payment_failed';
      
      // Add to status history
      orderUpdateData.statusHistory = admin.firestore.FieldValue.arrayUnion({
        status: 'payment_failed',
        timestamp: new Date(),
        note: failureReason || 'Payment failed',
        automated: true
      });
    }

    await db.collection('orders').doc(paymentData.orderId).update(orderUpdateData);

    // Send notification to user (implement notification service)
    if (status === 'success') {
      console.log(`✅ Payment successful for order ${paymentData.orderId}`);
      // Send success notification
    } else if (status === 'failed') {
      console.log(`❌ Payment failed for order ${paymentData.orderId}: ${failureReason}`);
      // Send failure notification
    }

    sendResponse(res, 200, true, {
      transactionId,
      status,
      processed: true
    }, "Webhook processed successfully");

  } catch (error) {
    console.error('❌ Payment webhook error:', error);
    sendResponse(res, 500, false, null, null, "Failed to process webhook", error.message);
  }
});

// GET /api/payments-api/status/:transactionId - Get payment status
router.get('/status/:transactionId', verifyAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;

    const paymentDoc = await db.collection('payments').doc(transactionId).get();
    if (!paymentDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Payment transaction not found");
    }

    const paymentData = paymentDoc.data();

    // Check if user owns this payment
    if (paymentData.userId !== req.user.uid) {
      return sendResponse(res, 403, false, null, null, "Access denied");
    }

    sendResponse(res, 200, true, {
      payment: {
        transactionId: paymentDoc.id,
        orderId: paymentData.orderId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        paymentMethod: paymentData.paymentMethod,
        status: paymentData.status,
        createdAt: paymentData.createdAt?.toDate(),
        updatedAt: paymentData.updatedAt?.toDate(),
        gatewayPaymentId: paymentData.gatewayPaymentId,
        failureReason: paymentData.failureReason
      }
    }, "Payment status fetched successfully");

  } catch (error) {
    console.error('❌ Get payment status error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch payment status", error.message);
  }
});

// POST /api/payments-api/refund - Process refund
router.post('/refund', verifyAuth, [
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Valid refund amount is required'),
  body('reason').notEmpty().withMessage('Refund reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { transactionId, amount, reason } = req.body;

    // Get payment record
    const paymentDoc = await db.collection('payments').doc(transactionId).get();
    if (!paymentDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Payment transaction not found");
    }

    const paymentData = paymentDoc.data();

    // Check if user owns this payment or is admin
    if (paymentData.userId !== req.user.uid && req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Access denied");
    }

    if (paymentData.status !== 'success') {
      return sendResponse(res, 400, false, null, null, "Can only refund successful payments");
    }

    const refundAmount = amount || paymentData.amount;
    if (refundAmount > paymentData.amount) {
      return sendResponse(res, 400, false, null, null, "Refund amount cannot exceed payment amount");
    }

    // Generate refund ID
    const refundId = `REF_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create refund record
    const refundData = {
      refundId,
      transactionId,
      orderId: paymentData.orderId,
      userId: paymentData.userId,
      amount: refundAmount,
      currency: paymentData.currency,
      reason,
      status: 'processing',
      requestedBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('refunds').doc(refundId).set(refundData);

    // Update payment record
    await db.collection('payments').doc(transactionId).update({
      refundStatus: 'processing',
      refundId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendResponse(res, 200, true, {
      refund: {
        refundId,
        transactionId,
        amount: refundAmount,
        currency: paymentData.currency,
        status: 'processing',
        reason
      }
    }, "Refund request submitted successfully");

  } catch (error) {
    console.error('❌ Process refund error:', error);
    sendResponse(res, 500, false, null, null, "Failed to process refund", error.message);
  }
});

module.exports = router;

