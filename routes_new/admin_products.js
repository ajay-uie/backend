const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../auth/firebaseConfig');
const { adminMiddleware } = require('../middleware/auth');

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

// GET /api/admin/products - Get all products for admin
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      isActive,
      isFeatured,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    console.log(`📦 Admin fetching products with filters:`, { category, search, isActive, isFeatured, sortBy, sortOrder });

    let query = db.collection('products');

    // Apply filters
    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }

    if (isFeatured !== undefined) {
      query = query.where('isFeatured', '==', isFeatured === 'true');
    }

    // Apply sorting
    query = query.orderBy(sortBy, sortOrder);

    // Get all products first
    const snapshot = await query.get();
    let products = [];

    console.log(`📦 Found ${snapshot.size} products in database`);

    snapshot.forEach(doc => {
      const productData = doc.data();

      // Apply search filter
      if (search) {
        const searchTerm = search.toLowerCase();
        const nameMatch = productData.name?.toLowerCase().includes(searchTerm);
        const descMatch = productData.description?.toLowerCase().includes(searchTerm);
        const brandMatch = productData.brand?.toLowerCase().includes(searchTerm);
        if (!nameMatch && !descMatch && !brandMatch) return;
      }

      products.push({
        id: doc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate ? productData.createdAt.toDate() : productData.createdAt,
        updatedAt: productData.updatedAt?.toDate ? productData.updatedAt.toDate() : productData.updatedAt
      });
    });

    console.log(`📦 Filtered to ${products.length} products`);

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
      },
      filters: {
        category,
        search,
        isActive,
        isFeatured,
        sortBy,
        sortOrder
      }
    }, "Products fetched successfully");

  } catch (error) {
    console.error('❌ Admin get products error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch products", error.message);
  }
});

// GET /api/admin/products/:id - Get single product for admin
router.get('/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await db.collection('products').doc(id).get();

    if (!doc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const productData = doc.data();
    const product = {
      id: doc.id,
      ...productData,
      createdAt: productData.createdAt?.toDate ? productData.createdAt.toDate() : productData.createdAt,
      updatedAt: productData.updatedAt?.toDate ? productData.updatedAt.toDate() : productData.updatedAt
    };

    sendResponse(res, 200, true, product, "Product fetched successfully");

  } catch (error) {
    console.error('❌ Admin get product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch product", error.message);
  }
});

// POST /api/admin/products - Create new product
router.post('/', [
  adminMiddleware,
  body('name').notEmpty().withMessage('Product name is required'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('category').notEmpty().withMessage('Category is required'),
  body('description').notEmpty().withMessage('Description is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const productData = {
      ...req.body,
      createdAt: admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
      updatedAt: admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      isFeatured: req.body.isFeatured !== undefined ? req.body.isFeatured : false
    };

    const docRef = await db.collection('products').add(productData);

    sendResponse(res, 201, true, { id: docRef.id, ...productData }, "Product created successfully");

  } catch (error) {
    console.error('❌ Admin create product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create product", error.message);
  }
});

// PUT /api/admin/products/:id - Update product
router.put('/:id', [
  adminMiddleware,
  body('name').optional().notEmpty().withMessage('Product name cannot be empty'),
  body('price').optional().isNumeric().withMessage('Price must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedAt: admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date()
    };

    await db.collection('products').doc(id).update(updateData);

    sendResponse(res, 200, true, { id, ...updateData }, "Product updated successfully");

  } catch (error) {
    console.error('❌ Admin update product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update product", error.message);
  }
});

// DELETE /api/admin/products/:id - Delete product
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await db.collection('products').doc(id).delete();

    sendResponse(res, 200, true, { id }, "Product deleted successfully");

  } catch (error) {
    console.error('❌ Admin delete product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete product", error.message);
  }
});

module.exports = router;

