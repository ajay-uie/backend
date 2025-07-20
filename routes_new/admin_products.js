const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../auth/firebaseConfig');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

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

// GET /admin/products - Get all products for admin (with pagination)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
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

    console.log(`📦 Admin fetching products - Page: ${page}, Limit: ${limit}`);

    let query = db.collection('products');

    // Apply filters
    if (category) {
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

    // Get total count for pagination
    const totalSnapshot = await query.get();
    const totalProducts = totalSnapshot.size;

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginatedQuery = query.limit(parseInt(limit)).offset(offset);
    
    const snapshot = await paginatedQuery.get();

    const products = [];
    snapshot.forEach(doc => {
      const productData = doc.data();
      
      // Apply search filter if provided (client-side filtering for text search)
      if (search) {
        const searchTerm = search.toLowerCase();
        const productName = productData.name?.toLowerCase() || '';
        const productDescription = productData.description?.toLowerCase() || '';
        const productCategory = productData.category?.toLowerCase() || '';
        
        if (!productName.includes(searchTerm) && 
            !productDescription.includes(searchTerm) && 
            !productCategory.includes(searchTerm)) {
          return; // Skip this product
        }
      }

      products.push({
        id: doc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
      });
    });

    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    console.log(`✅ Admin found ${products.length} products (Page ${page}/${totalPages})`);

    sendResponse(res, 200, true, {
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      },
      filters: {
        category,
        search,
        isActive,
        isFeatured,
        sortBy,
        sortOrder
      }
    }, "Admin products fetched successfully");

  } catch (error) {
    console.error('❌ Admin get products error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch admin products", error.message);
  }
});

// GET /admin/products/:id - Get single product for admin
router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📦 Admin fetching product with ID: ${id}`);

    const productDoc = await db.collection('products').doc(id).get();

    if (!productDoc.exists) {
      console.log(`❌ Product not found: ${id}`);
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const productData = productDoc.data();

    console.log(`✅ Admin product found: ${productData.name}`);

    sendResponse(res, 200, true, {
      product: {
        id: productDoc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
      }
    }, "Admin product fetched successfully");

  } catch (error) {
    console.error('❌ Admin get product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch admin product", error.message);
  }
});

// POST /admin/products - Create new product (Admin only)
router.post('/', authMiddleware, adminMiddleware, [
  body('name').notEmpty().withMessage('Product name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('stock').isInt({ min: 0 }).withMessage('Valid stock quantity is required')
], async (req, res) => {
  try {
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

    console.log(`📦 Admin creating product: ${name}`);

    const productData = {
      name,
      price: parseFloat(price),
      category,
      description,
      stock: parseInt(stock),
      brand: brand || "",
      sku: sku || `SKU-${Date.now()}`,
      images: images || [],
      isActive: Boolean(isActive),
      isFeatured: Boolean(isFeatured),
      weight: weight ? parseFloat(weight) : null,
      dimensions: dimensions || null,
      tags: tags || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid,
      updatedBy: req.user.uid
    };

    const docRef = await db.collection('products').add(productData);

    console.log(`✅ Admin product created: ${name} (ID: ${docRef.id})`);

    sendResponse(res, 201, true, {
      product: {
        id: docRef.id,
        ...productData,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }, "Admin product created successfully");

  } catch (error) {
    console.error('❌ Admin create product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create admin product", error.message);
  }
});

// PUT /admin/products/:id - Update product (Admin only)
router.put('/:id', authMiddleware, adminMiddleware, [
  body('name').optional().notEmpty().withMessage('Product name cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Valid stock quantity is required')
], async (req, res) => {
  try {
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

    console.log(`📦 Admin updating product: ${id}`);

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

    console.log(`✅ Admin product updated: ${updatedData.name} (ID: ${id})`);

    sendResponse(res, 200, true, {
      product: {
        id: updatedDoc.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate()
      }
    }, "Admin product updated successfully");

  } catch (error) {
    console.error('❌ Admin update product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update admin product", error.message);
  }
});

// PATCH /admin/products/:id - Partially update product (Admin only)
router.patch('/:id', authMiddleware, adminMiddleware, [
  body('name').optional().notEmpty().withMessage('Product name cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Valid stock quantity is required')
], async (req, res) => {
  try {
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

    console.log(`📦 Admin partially updating product: ${id}`);

    // Only update provided fields
    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    };

    // Add only the fields that were provided in the request
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key];
      }
    });

    // Convert numeric fields
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.stock) updateData.stock = parseInt(updateData.stock);
    if (updateData.weight) updateData.weight = parseFloat(updateData.weight);

    await productRef.update(updateData);

    const updatedDoc = await productRef.get();
    const updatedData = updatedDoc.data();

    console.log(`✅ Admin product partially updated: ${updatedData.name} (ID: ${id})`);

    sendResponse(res, 200, true, {
      product: {
        id: updatedDoc.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate()
      }
    }, "Admin product partially updated successfully");

  } catch (error) {
    console.error('❌ Admin partial update product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to partially update admin product", error.message);
  }
});

// DELETE /admin/products/:id - Delete product (Admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const productRef = db.collection('products').doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const productData = productDoc.data();
    console.log(`📦 Admin deleting product: ${productData.name} (ID: ${id})`);

    await productRef.delete();

    console.log(`✅ Admin product deleted: ${productData.name} (ID: ${id})`);

    sendResponse(res, 200, true, {
      deletedProduct: {
        id,
        name: productData.name
      }
    }, "Admin product deleted successfully");

  } catch (error) {
    console.error('❌ Admin delete product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete admin product", error.message);
  }
});

// POST /admin/products/:id/toggle-active - Toggle product active status
router.post('/:id/toggle-active', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const productRef = db.collection('products').doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const productData = productDoc.data();
    const newActiveStatus = !productData.isActive;

    console.log(`📦 Admin toggling product active status: ${productData.name} (${productData.isActive} → ${newActiveStatus})`);

    await productRef.update({
      isActive: newActiveStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    });

    console.log(`✅ Admin product active status toggled: ${productData.name} (ID: ${id})`);

    sendResponse(res, 200, true, {
      product: {
        id,
        name: productData.name,
        isActive: newActiveStatus
      }
    }, `Product ${newActiveStatus ? 'activated' : 'deactivated'} successfully`);

  } catch (error) {
    console.error('❌ Admin toggle product active error:', error);
    sendResponse(res, 500, false, null, null, "Failed to toggle product active status", error.message);
  }
});

// POST /admin/products/:id/toggle-featured - Toggle product featured status
router.post('/:id/toggle-featured', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const productRef = db.collection('products').doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const productData = productDoc.data();
    const newFeaturedStatus = !productData.isFeatured;

    console.log(`📦 Admin toggling product featured status: ${productData.name} (${productData.isFeatured} → ${newFeaturedStatus})`);

    await productRef.update({
      isFeatured: newFeaturedStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    });

    console.log(`✅ Admin product featured status toggled: ${productData.name} (ID: ${id})`);

    sendResponse(res, 200, true, {
      product: {
        id,
        name: productData.name,
        isFeatured: newFeaturedStatus
      }
    }, `Product ${newFeaturedStatus ? 'featured' : 'unfeatured'} successfully`);

  } catch (error) {
    console.error('❌ Admin toggle product featured error:', error);
    sendResponse(res, 500, false, null, null, "Failed to toggle product featured status", error.message);
  }
});

module.exports = router;

