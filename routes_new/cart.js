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

// POST /api/cart/add - Add item to cart
router.post('/add', verifyAuth, [
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Valid quantity is required'),
  body('size').optional().isString().withMessage('Size must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { productId, quantity, size } = req.body;
    const userId = req.user.uid;

    // Verify product exists and is active
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const product = productDoc.data();
    if (!product.isActive) {
      return sendResponse(res, 400, false, null, null, "Product is not available");
    }

    if (product.stock < quantity) {
      return sendResponse(res, 400, false, null, null, "Insufficient stock available");
    }

    // Create cart item identifier
    const cartItemId = size ? `${productId}_${size}` : productId;

    // Check if item already exists in cart
    const cartRef = db.collection('cart').doc(userId);
    const cartDoc = await cartRef.get();

    let cartData = cartDoc.exists ? cartDoc.data() : { items: [], updatedAt: new Date() };

    // Find existing item
    const existingItemIndex = cartData.items.findIndex(item => 
      item.productId === productId && item.size === (size || '')
    );

    if (existingItemIndex >= 0) {
      // Update existing item quantity
      const newQuantity = cartData.items[existingItemIndex].quantity + quantity;
      
      if (newQuantity > product.stock) {
        return sendResponse(res, 400, false, null, null, "Cannot add more items than available stock");
      }

      cartData.items[existingItemIndex].quantity = newQuantity;
      cartData.items[existingItemIndex].updatedAt = new Date();
    } else {
      // Add new item to cart
      const cartItem = {
        id: cartItemId,
        productId,
        name: product.name,
        price: product.price,
        quantity,
        size: size || '',
        image: product.images?.[0] || '',
        addedAt: new Date(),
        updatedAt: new Date()
      };

      cartData.items.push(cartItem);
    }

    cartData.updatedAt = new Date();

    // Save cart
    await cartRef.set(cartData);

    // Calculate cart totals
    const subtotal = cartData.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    const itemCount = cartData.items.reduce((count, item) => count + item.quantity, 0);

    sendResponse(res, 200, true, {
      cart: {
        items: cartData.items,
        subtotal,
        itemCount,
        updatedAt: cartData.updatedAt
      }
    }, "Item added to cart successfully");

  } catch (error) {
    console.error('❌ Add to cart error:', error);
    sendResponse(res, 500, false, null, null, "Failed to add item to cart", error.message);
  }
});

// GET /api/cart - Get user's cart
router.get('/', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const cartRef = db.collection('cart').doc(userId);
    const cartDoc = await cartRef.get();

    if (!cartDoc.exists) {
      return sendResponse(res, 200, true, {
        cart: {
          items: [],
          subtotal: 0,
          itemCount: 0,
          updatedAt: new Date()
        }
      }, "Cart is empty");
    }

    const cartData = cartDoc.data();

    // Validate cart items against current product data
    const validatedItems = [];
    let hasChanges = false;

    for (const item of cartData.items) {
      const productDoc = await db.collection('products').doc(item.productId).get();
      
      if (!productDoc.exists || !productDoc.data().isActive) {
        // Remove inactive/deleted products
        hasChanges = true;
        continue;
      }

      const product = productDoc.data();
      
      // Update price if changed
      if (item.price !== product.price) {
        item.price = product.price;
        hasChanges = true;
      }

      // Update name if changed
      if (item.name !== product.name) {
        item.name = product.name;
        hasChanges = true;
      }

      // Check stock availability
      if (item.quantity > product.stock) {
        item.quantity = Math.max(1, product.stock);
        hasChanges = true;
      }

      validatedItems.push(item);
    }

    // Update cart if there were changes
    if (hasChanges) {
      cartData.items = validatedItems;
      cartData.updatedAt = new Date();
      await cartRef.set(cartData);
    }

    // Calculate totals
    const subtotal = validatedItems.reduce((total, item) => total + (item.price * item.quantity), 0);
    const itemCount = validatedItems.reduce((count, item) => count + item.quantity, 0);

    sendResponse(res, 200, true, {
      cart: {
        items: validatedItems,
        subtotal,
        itemCount,
        updatedAt: cartData.updatedAt
      }
    }, "Cart fetched successfully");

  } catch (error) {
    console.error('❌ Get cart error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch cart", error.message);
  }
});

// PUT /api/cart/update - Update cart item
router.put('/update', verifyAuth, [
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Valid quantity is required'),
  body('size').optional().isString().withMessage('Size must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { productId, quantity, size } = req.body;
    const userId = req.user.uid;

    const cartRef = db.collection('cart').doc(userId);
    const cartDoc = await cartRef.get();

    if (!cartDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Cart not found");
    }

    const cartData = cartDoc.data();
    const cartItemId = size ? `${productId}_${size}` : productId;
    const itemIndex = cartData.items.findIndex(item => item.id === cartItemId);

    if (itemIndex === -1) {
      return sendResponse(res, 404, false, null, null, "Cart item not found");
    }

    const item = cartData.items[itemIndex];

    // Verify product stock
    const productDoc = await db.collection('products').doc(item.productId).get();
    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const product = productDoc.data();
    if (quantity > product.stock) {
      return sendResponse(res, 400, false, null, null, "Insufficient stock available");
    }

    // Update item quantity
    cartData.items[itemIndex].quantity = quantity;
    cartData.items[itemIndex].updatedAt = new Date();
    cartData.updatedAt = new Date();

    await cartRef.set(cartData);

    // Calculate totals
    const subtotal = cartData.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    const itemCount = cartData.items.reduce((count, item) => count + item.quantity, 0);

    sendResponse(res, 200, true, {
      cart: {
        items: cartData.items,
        subtotal,
        itemCount,
        updatedAt: cartData.updatedAt
      }
    }, "Cart item updated successfully");

  } catch (error) {
    console.error('❌ Update cart error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update cart item", error.message);
  }
});

// DELETE /api/cart/remove - Remove cart item
router.delete('/remove', verifyAuth, [
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('size').optional().isString().withMessage('Size must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { productId, size } = req.body;
    const userId = req.user.uid;

    const cartRef = db.collection('cart').doc(userId);
    const cartDoc = await cartRef.get();

    if (!cartDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Cart not found");
    }

    const cartData = cartDoc.data();
    const cartItemId = size ? `${productId}_${size}` : productId;
    const itemIndex = cartData.items.findIndex(item => item.id === cartItemId);

    if (itemIndex === -1) {
      return sendResponse(res, 404, false, null, null, "Cart item not found");
    }

    // Remove item from cart
    cartData.items.splice(itemIndex, 1);
    cartData.updatedAt = new Date();

    await cartRef.set(cartData);

    // Calculate totals
    const subtotal = cartData.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    const itemCount = cartData.items.reduce((count, item) => count + item.quantity, 0);

    sendResponse(res, 200, true, {
      cart: {
        items: cartData.items,
        subtotal,
        itemCount,
        updatedAt: cartData.updatedAt
      }
    }, "Item removed from cart successfully");

  } catch (error) {
    console.error('❌ Remove cart item error:', error);
    sendResponse(res, 500, false, null, null, "Failed to remove cart item", error.message);
  }
});

// DELETE /api/cart/clear - Clear user cart
router.delete('/clear', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const cartRef = db.collection('cart').doc(userId);

    await cartRef.set({
      items: [],
      updatedAt: new Date()
    });

    sendResponse(res, 200, true, {
      cart: {
        items: [],
        subtotal: 0,
        itemCount: 0,
        updatedAt: new Date()
      }
    }, "Cart cleared successfully");

  } catch (error) {
    console.error('❌ Clear cart error:', error);
    sendResponse(res, 500, false, null, null, "Failed to clear cart", error.message);
  }
});

// POST /api/cart/sync - Sync cart with local storage
router.post('/sync', verifyAuth, [
  body('items').isArray().withMessage('Items must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { items } = req.body;
    const userId = req.user.uid;

    // Validate and process items
    const validatedItems = [];
    
    for (const item of items) {
      if (!item.productId || !item.quantity) continue;

      const productDoc = await db.collection('products').doc(item.productId).get();
      if (!productDoc.exists) continue;

      const product = productDoc.data();
      if (!product.isActive) continue;

      const cartItemId = item.size ? `${item.productId}_${item.size}` : item.productId;
      
      validatedItems.push({
        id: cartItemId,
        productId: item.productId,
        name: product.name,
        price: product.price,
        quantity: Math.min(item.quantity, product.stock),
        size: item.size || '',
        image: product.images?.[0] || '',
        addedAt: new Date(),
        updatedAt: new Date()
      });
    }

    const cartData = {
      items: validatedItems,
      updatedAt: new Date()
    };

    const cartRef = db.collection('cart').doc(userId);
    await cartRef.set(cartData);

    // Calculate totals
    const subtotal = validatedItems.reduce((total, item) => total + (item.price * item.quantity), 0);
    const itemCount = validatedItems.reduce((count, item) => count + item.quantity, 0);

    sendResponse(res, 200, true, {
      cart: {
        items: validatedItems,
        subtotal,
        itemCount,
        updatedAt: cartData.updatedAt
      }
    }, "Cart synced successfully");

  } catch (error) {
    console.error('❌ Sync cart error:', error);
    sendResponse(res, 500, false, null, null, "Failed to sync cart", error.message);
  }
});

module.exports = router;

