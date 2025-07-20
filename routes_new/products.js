const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../auth/firebaseConfig');
const { authMiddleware, adminMiddleware, optionalAuthMiddleware } = require('../middleware/auth');

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

// GET /products - Get all products with filtering and pagination (PUBLIC)
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

    console.log(`📦 Fetching products with filters:`, { category, search, minPrice, maxPrice, sortBy, sortOrder });

    let query = db.collection('products');

    // Apply filters
    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    // Only show active products for public endpoint
    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    } else {
      query = query.where('isActive', '==', true); // Default to active products only
    }

    if (isFeatured !== undefined) {
      query = query.where('isFeatured', '==', isFeatured === 'true');
    }

    // Apply sorting
    try {
      query = query.orderBy(sortBy, sortOrder);
    } catch (error) {
      console.warn(`⚠️ Sorting by ${sortBy} failed, using default sorting`);
      query = query.orderBy('createdAt', 'desc');
    }

    // Get all products first
    const snapshot = await query.get();
    let products = [];

    console.log(`📦 Found ${snapshot.size} products in database`);

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
        const tagsMatch = productData.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
        if (!nameMatch && !descMatch && !brandMatch && !tagsMatch) return;
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

// GET /products/featured - Get featured products (PUBLIC)
router.get('/featured', async (req, res) => {
  try {
    const { limit = 6 } = req.query;

    const snapshot = await db.collection('products')
      .where('isActive', '==', true)
      .where('isFeatured', '==', true)
      .orderBy('rating', 'desc')
      .limit(parseInt(limit))
      .get();

    const products = [];
    snapshot.forEach(doc => {
      const productData = doc.data();
      products.push({
        id: doc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate ? productData.createdAt.toDate() : productData.createdAt,
        updatedAt: productData.updatedAt?.toDate ? productData.updatedAt.toDate() : productData.updatedAt
      });
    });

    sendResponse(res, 200, true, { products }, "Featured products fetched successfully");

  } catch (error) {
    console.error('❌ Get featured products error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch featured products", error.message);
  }
});

// GET /products/categories - Get all categories (PUBLIC)
router.get('/categories', async (req, res) => {
  try {
    const snapshot = await db.collection('categories')
      .where('isActive', '==', true)
      .orderBy('name', 'asc')
      .get();

    const categories = [];
    snapshot.forEach(doc => {
      const categoryData = doc.data();
      categories.push({
        id: doc.id,
        ...categoryData
      });
    });

    sendResponse(res, 200, true, { categories }, "Categories fetched successfully");

  } catch (error) {
    console.error('❌ Get categories error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch categories", error.message);
  }
});

// GET /products/:id - Get single product (PUBLIC)
router.get('/:id', async (req, res) => {
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

    // Get related products (same category, excluding current product)
    const relatedSnapshot = await db.collection('products')
      .where('category', '==', productData.category)
      .where('isActive', '==', true)
      .limit(4)
      .get();

    const relatedProducts = [];
    relatedSnapshot.forEach(relatedDoc => {
      if (relatedDoc.id !== id) {
        const relatedData = relatedDoc.data();
        relatedProducts.push({
          id: relatedDoc.id,
          name: relatedData.name,
          price: relatedData.price,
          images: relatedData.images,
          rating: relatedData.rating
        });
      }
    });

    sendResponse(res, 200, true, { 
      product, 
      relatedProducts: relatedProducts.slice(0, 3) 
    }, "Product fetched successfully");

  } catch (error) {
    console.error('❌ Get product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch product", error.message);
  }
});

// POST /products - Create new product (ADMIN ONLY)
router.post('/', [
  adminMiddleware,
  body('name').notEmpty().withMessage('Product name is required'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('category').notEmpty().withMessage('Category is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('brand').notEmpty().withMessage('Brand is required'),
  body('stock').isNumeric().withMessage('Stock must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const productData = {
      name: req.body.name,
      description: req.body.description,
      price: parseFloat(req.body.price),
      originalPrice: req.body.originalPrice ? parseFloat(req.body.originalPrice) : null,
      category: req.body.category,
      brand: req.body.brand,
      stock: parseInt(req.body.stock),
      images: req.body.images || [],
      isFeatured: req.body.isFeatured === true || req.body.isFeatured === 'true',
      isActive: req.body.isActive !== false && req.body.isActive !== 'false',
      sku: req.body.sku || `FRG-${Date.now()}`,
      weight: req.body.weight ? parseFloat(req.body.weight) : 100,
      size: req.body.size || '100ml',
      rating: req.body.rating ? parseFloat(req.body.rating) : 0,
      reviews: req.body.reviews ? parseInt(req.body.reviews) : 0,
      tags: req.body.tags || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('products').add(productData);

    console.log(`✅ Product created with ID: ${docRef.id}`);
    sendResponse(res, 201, true, { id: docRef.id, ...productData }, "Product created successfully");

  } catch (error) {
    console.error('❌ Create product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create product", error.message);
  }
});

// PUT /products/:id - Update product (ADMIN ONLY)
router.put('/:id', [
  adminMiddleware,
  body('name').optional().notEmpty().withMessage('Product name cannot be empty'),
  body('price').optional().isNumeric().withMessage('Price must be a number'),
  body('stock').optional().isNumeric().withMessage('Stock must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const { id } = req.params;
    
    // Check if product exists
    const doc = await db.collection('products').doc(id).get();
    if (!doc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Convert string numbers to actual numbers
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.originalPrice) updateData.originalPrice = parseFloat(updateData.originalPrice);
    if (updateData.stock) updateData.stock = parseInt(updateData.stock);
    if (updateData.weight) updateData.weight = parseFloat(updateData.weight);
    if (updateData.rating) updateData.rating = parseFloat(updateData.rating);
    if (updateData.reviews) updateData.reviews = parseInt(updateData.reviews);

    await db.collection('products').doc(id).update(updateData);

    console.log(`✅ Product updated: ${id}`);
    sendResponse(res, 200, true, { id, ...updateData }, "Product updated successfully");

  } catch (error) {
    console.error('❌ Update product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update product", error.message);
  }
});

// DELETE /products/:id - Delete product (ADMIN ONLY)
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if product exists
    const doc = await db.collection('products').doc(id).get();
    if (!doc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    await db.collection('products').doc(id).delete();

    console.log(`✅ Product deleted: ${id}`);
    sendResponse(res, 200, true, { id }, "Product deleted successfully");

  } catch (error) {
    console.error('❌ Delete product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete product", error.message);
  }
});

// PATCH /products/:id/stock - Update product stock (ADMIN ONLY)
router.patch('/:id/stock', [
  adminMiddleware,
  body('stock').isNumeric().withMessage('Stock must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, null, "Validation failed", errors.array());
    }

    const { id } = req.params;
    const { stock } = req.body;

    // Check if product exists
    const doc = await db.collection('products').doc(id).get();
    if (!doc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    await db.collection('products').doc(id).update({
      stock: parseInt(stock),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Product stock updated: ${id} -> ${stock}`);
    sendResponse(res, 200, true, { id, stock: parseInt(stock) }, "Product stock updated successfully");

  } catch (error) {
    console.error('❌ Update product stock error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update product stock", error.message);
  }
});

// PATCH /products/:id/featured - Toggle product featured status (ADMIN ONLY)
router.patch('/:id/featured', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isFeatured } = req.body;

    // Check if product exists
    const doc = await db.collection('products').doc(id).get();
    if (!doc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const currentData = doc.data();
    const newFeaturedStatus = isFeatured !== undefined ? isFeatured : !currentData.isFeatured;

    await db.collection('products').doc(id).update({
      isFeatured: newFeaturedStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Product featured status updated: ${id} -> ${newFeaturedStatus}`);
    sendResponse(res, 200, true, { id, isFeatured: newFeaturedStatus }, "Product featured status updated successfully");

  } catch (error) {
    console.error('❌ Update product featured status error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update product featured status", error.message);
  }
});

module.exports = router;

