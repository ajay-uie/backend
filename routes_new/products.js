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

// Helper: Create sample products if none exist
const ensureSampleProducts = async () => {
  try {
    const snapshot = await db.collection('products').limit(1).get();
    
    if (snapshot.empty) {
      console.log('📦 No products found, creating sample products...');
      
      const sampleProducts = [
        {
          name: "Midnight Oud",
          description: "A rich and mysterious fragrance with notes of oud and rose. Perfect for evening wear.",
          price: 2999,
          category: "Oud",
          brand: "Fragransia",
          stock: 100,
          images: ["/images/midnight-oud.jpg"],
          isFeatured: true,
          isActive: true,
          sku: "FRG-MO-001",
          weight: 100,
          tags: ["oud", "rose", "evening", "luxury"],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          name: "Rose Garden",
          description: "A delicate and fresh fragrance inspired by a blooming rose garden. Light and romantic.",
          price: 2499,
          category: "Floral",
          brand: "Fragransia",
          stock: 150,
          images: ["/images/rose-garden.jpg"],
          isFeatured: true,
          isActive: true,
          sku: "FRG-RG-002",
          weight: 100,
          tags: ["rose", "floral", "fresh", "romantic"],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          name: "Citrus Burst",
          description: "A vibrant and energetic scent with zesty citrus notes. Perfect for daytime wear.",
          price: 1899,
          category: "Citrus",
          brand: "Fragransia",
          stock: 80,
          images: ["/images/citrus-burst.jpg"],
          isFeatured: false,
          isActive: true,
          sku: "FRG-CB-003",
          weight: 100,
          tags: ["citrus", "fresh", "energetic", "daytime"],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          name: "Vanilla Dreams",
          description: "A warm and comforting fragrance with vanilla and amber notes. Cozy and inviting.",
          price: 2199,
          category: "Oriental",
          brand: "Fragransia",
          stock: 120,
          images: ["/images/vanilla-dreams.jpg"],
          isFeatured: false,
          isActive: true,
          sku: "FRG-VD-004",
          weight: 100,
          tags: ["vanilla", "amber", "warm", "comfort"],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      ];

      const batch = db.batch();
      sampleProducts.forEach(product => {
        const docRef = db.collection('products').doc();
        batch.set(docRef, product);
      });
      
      await batch.commit();
      console.log('✅ Sample products created successfully');
    }
  } catch (error) {
    console.error('❌ Error ensuring sample products:', error);
  }
};

// Initialize sample products on module load
ensureSampleProducts();

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
    query = query.orderBy(sortBy, sortOrder);

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
        if (!nameMatch && !descMatch && !brandMatch) return;
      }

      products.push({
        id: doc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
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

// GET /products/:id - Get single product (PUBLIC)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📦 Fetching product with ID: ${id}`);

    const productDoc = await db.collection('products').doc(id).get();

    if (!productDoc.exists) {
      console.log(`❌ Product not found: ${id}`);
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    const productData = productDoc.data();

    console.log(`✅ Product found: ${productData.name}`);

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

// POST /products - Create new product (Admin only)
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

    const productData = {
      name,
      price: parseFloat(price),
      category,
      description,
      stock: parseInt(stock),
      brand: brand || 'Fragransia',
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

    console.log(`✅ Product created: ${name} (ID: ${docRef.id})`);

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

// PUT /products/:id - Update product (Admin only)
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

    console.log(`✅ Product updated: ${updatedData.name} (ID: ${id})`);

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

// PATCH /products/:id - Partially update product (Admin only) - FIXED: Added missing PATCH endpoint
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

    console.log(`✅ Product patched: ${updatedData.name} (ID: ${id})`);

    sendResponse(res, 200, true, {
      product: {
        id: updatedDoc.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate()
      }
    }, "Product updated successfully");

  } catch (error) {
    console.error('❌ Patch product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update product", error.message);
  }
});

// DELETE /products/:id - Delete product (Admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const productRef = db.collection('products').doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    await productRef.delete();

    console.log(`✅ Product deleted: ID ${id}`);

    sendResponse(res, 200, true, null, "Product deleted successfully");

  } catch (error) {
    console.error('❌ Delete product error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete product", error.message);
  }
});

// GET /products/categories - Get all product categories (PUBLIC)
router.get('/categories', async (req, res) => {
  try {
    const snapshot = await db.collection('products').where('isActive', '==', true).get();
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

// GET /products/brands - Get all product brands (PUBLIC)
router.get('/brands', async (req, res) => {
  try {
    const snapshot = await db.collection('products').where('isActive', '==', true).get();
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

// GET /products/featured - Get featured products (PUBLIC)
router.get('/featured', async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const snapshot = await db.collection('products')
      .where('isActive', '==', true)
      .where('isFeatured', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const products = [];
    snapshot.forEach(doc => {
      const productData = doc.data();
      products.push({
        id: doc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
      });
    });

    sendResponse(res, 200, true, {
      products
    }, "Featured products fetched successfully");

  } catch (error) {
    console.error('❌ Get featured products error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch featured products", error.message);
  }
});

module.exports = router;

