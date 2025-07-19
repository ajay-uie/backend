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

// GET /api/products - Get all products with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      search,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive,
      isFeatured
    } = req.query;

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

    snapshot.forEach(doc => {
      const productData = doc.data();

      // Apply price filters
      if (minPrice && productData.price < parseFloat(minPrice)) return;
      if (maxPrice && productData.price > parseFloat(maxPrice)) return;

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
      },
      filters: {
        category,
        search,
        minPrice,
        maxPrice,
        sortBy,
        sortOrder,
        isActive,
        isFeatured
      }
    }, "Products fetched successfully");

  } catch (error) {
    console.error('❌ Get products error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch products", error.message);
  }
});

// GET /api/products/:id - Get single product
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const productDoc = await db.collection('products').doc(id).get();

    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const productData = productDoc.data();

    sendResponse(res, 200, true, {
      product: {
        id: productDoc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
      }
    }, "Product fetched successfully");

  } catch (error) {
    console.error('❌ Get product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch product", error.message);
  }
});

// POST /api/products - Create new product (Admin only)
router.post('/', verifyAuth, [
  body('name').notEmpty().withMessage('Product name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('stock').isInt({ min: 0 }).withMessage('Valid stock quantity is required')
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

    const {
      name,
      price,
      category,
      description,
      stock,
      brand,
      sku,
      images,
      isActive = true,
      isFeatured = false,
      weight,
      dimensions,
      tags
    } = req.body;

    const productData = {
      name,
      price: parseFloat(price),
      category,
      description,
      stock: parseInt(stock),
      brand: brand || '',
      sku: sku || `SKU_${Date.now()}`,
      images: images || [],
      isActive: Boolean(isActive),
      isFeatured: Boolean(isFeatured),
      weight: weight ? parseFloat(weight) : 0,
      dimensions: dimensions || {},
      tags: tags || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid
    };

    const docRef = await db.collection('products').add(productData);

    sendResponse(res, 201, true, {
      product: {
        id: docRef.id,
        ...productData,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }, "Product created successfully");

  } catch (error) {
    console.error('❌ Create product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create product", error.message);
  }
});

// PUT /api/products/:id - Update product (Admin only)
router.put('/:id', verifyAuth, [
  body('name').optional().notEmpty().withMessage('Product name cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Valid stock quantity is required')
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
    const productRef = db.collection('products').doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    };

    // Convert numeric fields
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.stock) updateData.stock = parseInt(updateData.stock);
    if (updateData.weight) updateData.weight = parseFloat(updateData.weight);

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

// DELETE /api/products/:id - Delete product (Admin only)
router.delete('/:id', verifyAuth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "Admin access required");
    }

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

// GET /api/products/categories - Get all product categories
router.get('/meta/categories', async (req, res) => {
  try {
    const snapshot = await db.collection('products').get();
    const categories = new Set();

    snapshot.forEach(doc => {
      const product = doc.data();
      if (product.category) {
        categories.add(product.category);
      }
    });

    sendResponse(res, 200, true, {
      categories: Array.from(categories).sort()
    }, "Categories fetched successfully");

  } catch (error) {
    console.error('❌ Get categories error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch categories", error.message);
  }
});

// GET /api/products/brands - Get all product brands
router.get('/meta/brands', async (req, res) => {
  try {
    const snapshot = await db.collection('products').get();
    const brands = new Set();

    snapshot.forEach(doc => {
      const product = doc.data();
      if (product.brand) {
        brands.add(product.brand);
      }
    });

    sendResponse(res, 200, true, {
      brands: Array.from(brands).sort()
    }, "Brands fetched successfully");

  } catch (error) {
    console.error('❌ Get brands error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch brands", error.message);
  }
});

module.exports = router;

