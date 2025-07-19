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

// GET /api/wishlist/user - Get user's wishlist
router.get('/user', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const {
      page = 1,
      limit = 12,
      sortBy = 'addedAt',
      sortOrder = 'desc'
    } = req.query;

    const wishlistRef = db.collection('wishlist').doc(userId);
    const wishlistDoc = await wishlistRef.get();

    if (!wishlistDoc.exists) {
      return sendResponse(res, 200, true, {
        wishlist: {
          items: [],
          totalItems: 0,
          updatedAt: new Date()
        },
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          hasNextPage: false,
          hasPrevPage: false,
          limit: parseInt(limit)
        }
      }, "Wishlist is empty");
    }

    const wishlistData = wishlistDoc.data();
    let items = wishlistData.items || [];

    // Validate wishlist items against current product data
    const validatedItems = [];
    let hasChanges = false;

    for (const item of items) {
      const productDoc = await db.collection('products').doc(item.productId).get();
      
      if (!productDoc.exists || !productDoc.data().isActive) {
        // Remove inactive/deleted products
        hasChanges = true;
        continue;
      }

      const product = productDoc.data();
      
      // Update product details if changed
      const updatedItem = {
        ...item,
        name: product.name,
        price: product.price,
        image: product.images?.[0] || '',
        isAvailable: product.stock > 0,
        stock: product.stock
      };

      if (JSON.stringify(item) !== JSON.stringify(updatedItem)) {
        hasChanges = true;
      }

      validatedItems.push(updatedItem);
    }

    // Update wishlist if there were changes
    if (hasChanges) {
      await wishlistRef.update({
        items: validatedItems,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Sort items
    validatedItems.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedItems = validatedItems.slice(startIndex, endIndex);

    const totalItems = validatedItems.length;
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    sendResponse(res, 200, true, {
      wishlist: {
        items: paginatedItems,
        totalItems,
        updatedAt: wishlistData.updatedAt?.toDate() || new Date()
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    }, "Wishlist fetched successfully");

  } catch (error) {
    console.error('❌ Get wishlist error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch wishlist", error.message);
  }
});

// POST /api/wishlist/add - Add product to wishlist
router.post('/add', verifyAuth, [
  body('productId').notEmpty().withMessage('Product ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { productId } = req.body;
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

    const wishlistRef = db.collection('wishlist').doc(userId);
    const wishlistDoc = await wishlistRef.get();

    let wishlistData = wishlistDoc.exists ? wishlistDoc.data() : { items: [], updatedAt: new Date() };

    // Check if product already exists in wishlist
    const existingItemIndex = wishlistData.items.findIndex(item => item.productId === productId);

    if (existingItemIndex >= 0) {
      return sendResponse(res, 409, false, null, null, "Product already in wishlist");
    }

    // Add new item to wishlist
    const wishlistItem = {
      productId,
      name: product.name,
      price: product.price,
      image: product.images?.[0] || '',
      addedAt: new Date(),
      isAvailable: product.stock > 0,
      stock: product.stock,
      category: product.category,
      brand: product.brand || ''
    };

    wishlistData.items.push(wishlistItem);
    wishlistData.updatedAt = new Date();

    // Save wishlist
    await wishlistRef.set(wishlistData);

    sendResponse(res, 201, true, {
      wishlist: {
        items: wishlistData.items,
        totalItems: wishlistData.items.length,
        updatedAt: wishlistData.updatedAt
      }
    }, "Product added to wishlist successfully");

  } catch (error) {
    console.error('❌ Add to wishlist error:', error);
    sendResponse(res, 500, false, null, null, "Failed to add product to wishlist", error.message);
  }
});

// DELETE /api/wishlist/remove/:productId - Remove product from wishlist
router.delete('/remove/:productId', verifyAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.uid;

    const wishlistRef = db.collection('wishlist').doc(userId);
    const wishlistDoc = await wishlistRef.get();

    if (!wishlistDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Wishlist not found");
    }

    const wishlistData = wishlistDoc.data();
    const itemIndex = wishlistData.items.findIndex(item => item.productId === productId);

    if (itemIndex === -1) {
      return sendResponse(res, 404, false, null, null, "Product not found in wishlist");
    }

    // Remove item from wishlist
    wishlistData.items.splice(itemIndex, 1);
    wishlistData.updatedAt = new Date();

    await wishlistRef.set(wishlistData);

    sendResponse(res, 200, true, {
      wishlist: {
        items: wishlistData.items,
        totalItems: wishlistData.items.length,
        updatedAt: wishlistData.updatedAt
      }
    }, "Product removed from wishlist successfully");

  } catch (error) {
    console.error('❌ Remove from wishlist error:', error);
    sendResponse(res, 500, false, null, null, "Failed to remove product from wishlist", error.message);
  }
});

// DELETE /api/wishlist/clear - Clear user wishlist
router.delete('/clear', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const wishlistRef = db.collection('wishlist').doc(userId);

    await wishlistRef.set({
      items: [],
      updatedAt: new Date()
    });

    sendResponse(res, 200, true, {
      wishlist: {
        items: [],
        totalItems: 0,
        updatedAt: new Date()
      }
    }, "Wishlist cleared successfully");

  } catch (error) {
    console.error('❌ Clear wishlist error:', error);
    sendResponse(res, 500, false, null, null, "Failed to clear wishlist", error.message);
  }
});

// POST /api/wishlist/move-to-cart - Move wishlist item to cart
router.post('/move-to-cart', verifyAuth, [
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('Valid quantity is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { productId, quantity = 1 } = req.body;
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

    // Remove from wishlist
    const wishlistRef = db.collection('wishlist').doc(userId);
    const wishlistDoc = await wishlistRef.get();

    if (wishlistDoc.exists) {
      const wishlistData = wishlistDoc.data();
      const itemIndex = wishlistData.items.findIndex(item => item.productId === productId);

      if (itemIndex >= 0) {
        wishlistData.items.splice(itemIndex, 1);
        wishlistData.updatedAt = new Date();
        await wishlistRef.set(wishlistData);
      }
    }

    // Add to cart
    const cartRef = db.collection('cart').doc(userId);
    const cartDoc = await cartRef.get();

    let cartData = cartDoc.exists ? cartDoc.data() : { items: [], updatedAt: new Date() };

    // Check if item already exists in cart
    const cartItemId = productId;
    const existingCartItemIndex = cartData.items.findIndex(item => item.productId === productId);

    if (existingCartItemIndex >= 0) {
      // Update existing item quantity
      const newQuantity = cartData.items[existingCartItemIndex].quantity + quantity;
      
      if (newQuantity > product.stock) {
        return sendResponse(res, 400, false, null, null, "Cannot add more items than available stock");
      }

      cartData.items[existingCartItemIndex].quantity = newQuantity;
      cartData.items[existingCartItemIndex].updatedAt = new Date();
    } else {
      // Add new item to cart
      const cartItem = {
        id: cartItemId,
        productId,
        name: product.name,
        price: product.price,
        quantity,
        size: '',
        image: product.images?.[0] || '',
        addedAt: new Date(),
        updatedAt: new Date()
      };

      cartData.items.push(cartItem);
    }

    cartData.updatedAt = new Date();
    await cartRef.set(cartData);

    sendResponse(res, 200, true, {
      message: "Product moved to cart successfully",
      cart: {
        items: cartData.items,
        itemCount: cartData.items.reduce((count, item) => count + item.quantity, 0),
        subtotal: cartData.items.reduce((total, item) => total + (item.price * item.quantity), 0)
      }
    }, "Product moved from wishlist to cart successfully");

  } catch (error) {
    console.error('❌ Move to cart error:', error);
    sendResponse(res, 500, false, null, null, "Failed to move product to cart", error.message);
  }
});

// POST /api/wishlist/check - Check if product is in wishlist
router.post('/check', verifyAuth, [
  body('productId').notEmpty().withMessage('Product ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { productId } = req.body;
    const userId = req.user.uid;

    const wishlistRef = db.collection('wishlist').doc(userId);
    const wishlistDoc = await wishlistRef.get();

    let isInWishlist = false;
    let addedAt = null;

    if (wishlistDoc.exists) {
      const wishlistData = wishlistDoc.data();
      const item = wishlistData.items.find(item => item.productId === productId);
      
      if (item) {
        isInWishlist = true;
        addedAt = item.addedAt;
      }
    }

    sendResponse(res, 200, true, {
      isInWishlist,
      addedAt,
      productId
    }, "Wishlist check completed");

  } catch (error) {
    console.error('❌ Check wishlist error:', error);
    sendResponse(res, 500, false, null, null, "Failed to check wishlist", error.message);
  }
});

// GET /api/wishlist/stats - Get wishlist statistics
router.get('/stats', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    const wishlistRef = db.collection('wishlist').doc(userId);
    const wishlistDoc = await wishlistRef.get();

    if (!wishlistDoc.exists) {
      return sendResponse(res, 200, true, {
        stats: {
          totalItems: 0,
          totalValue: 0,
          availableItems: 0,
          unavailableItems: 0,
          categories: {},
          brands: {}
        }
      }, "Wishlist statistics fetched successfully");
    }

    const wishlistData = wishlistDoc.data();
    const items = wishlistData.items || [];

    let totalValue = 0;
    let availableItems = 0;
    let unavailableItems = 0;
    const categories = {};
    const brands = {};

    items.forEach(item => {
      totalValue += item.price || 0;
      
      if (item.isAvailable) {
        availableItems++;
      } else {
        unavailableItems++;
      }

      if (item.category) {
        categories[item.category] = (categories[item.category] || 0) + 1;
      }

      if (item.brand) {
        brands[item.brand] = (brands[item.brand] || 0) + 1;
      }
    });

    sendResponse(res, 200, true, {
      stats: {
        totalItems: items.length,
        totalValue,
        availableItems,
        unavailableItems,
        categories,
        brands
      }
    }, "Wishlist statistics fetched successfully");

  } catch (error) {
    console.error('❌ Get wishlist stats error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch wishlist statistics", error.message);
  }
});

module.exports = router;

