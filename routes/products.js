const express = require('express');
const router = express.Router();
const { db } = require('../auth/firebaseConfig');
const verifyAuth = require('../middleware/verifyAuth');

// Get all products with filtering, searching, and pagination
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

    // Apply pagination
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
        const nameMatch = productData.name.toLowerCase().includes(searchTerm);
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

    // Get total count for pagination
    let countQuery = db.collection('products');
    if (category && category !== 'all') {
      countQuery = countQuery.where('category', '==', category);
    }
    if (isActive !== undefined) {
      countQuery = countQuery.where('isActive', '==', isActive === 'true');
    }

    const countSnapshot = await countQuery.get();
    const totalProducts = countSnapshot.size;
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
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
    });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products'
    });
  }
});

// Get single product by ID
router.get('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const productDoc = await db.collection('products').doc(productId).get();

    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const productData = productDoc.data();
    
    // Get related products (same category, excluding current product)
    const relatedSnapshot = await db.collection('products')
      .where('category', '==', productData.category)
      .where('isActive', '==', true)
      .limit(4)
      .get();

    const relatedProducts = [];
    relatedSnapshot.forEach(doc => {
      if (doc.id !== productId) {
        relatedProducts.push({
          id: doc.id,
          ...doc.data()
        });
      }
    });

    res.json({
      success: true,
      product: {
        id: productDoc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
      },
      relatedProducts
    });
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product'
    });
  }
});

// Get featured products
router.get('/featured/list', async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const snapshot = await db.collection('products')
      .where('isFeatured', '==', true)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const featuredProducts = [];
    snapshot.forEach(doc => {
      featuredProducts.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json({
      success: true,
      products: featuredProducts
    });
  } catch (error) {
    console.error('Featured products fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch featured products'
    });
  }
});

// Get categories
router.get('/categories/list', async (req, res) => {
  try {
    const snapshot = await db.collection('products')
      .where('isActive', '==', true)
      .get();

    const categories = new Set();
    snapshot.forEach(doc => {
      const productData = doc.data();
      if (productData.category) {
        categories.add(productData.category);
      }
    });

    res.json({
      success: true,
      categories: Array.from(categories).sort()
    });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
});

// Search products
router.get('/search/query', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        products: [],
        message: 'Search query too short'
      });
    }

    const searchTerm = q.toLowerCase().trim();
    const snapshot = await db.collection('products')
      .where('isActive', '==', true)
      .get();

    const searchResults = [];
    snapshot.forEach(doc => {
      const productData = doc.data();
      const nameMatch = productData.name.toLowerCase().includes(searchTerm);
      const descMatch = productData.description?.toLowerCase().includes(searchTerm);
      const brandMatch = productData.brand?.toLowerCase().includes(searchTerm);
      const tagsMatch = productData.tags?.some(tag => 
        tag.toLowerCase().includes(searchTerm)
      );

      if (nameMatch || descMatch || brandMatch || tagsMatch) {
        searchResults.push({
          id: doc.id,
          ...productData,
          relevance: nameMatch ? 3 : (brandMatch ? 2 : 1)
        });
      }
    });

    // Sort by relevance and limit results
    searchResults.sort((a, b) => b.relevance - a.relevance);
    const limitedResults = searchResults.slice(0, parseInt(limit));

    res.json({
      success: true,
      products: limitedResults,
      total: searchResults.length,
      query: q
    });
  } catch (error) {
    console.error('Product search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search products'
    });
  }
});

// Check product availability
router.get('/:id/availability', async (req, res) => {
  try {
    const productId = req.params.id;
    const productDoc = await db.collection('products').doc(productId).get();

    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const productData = productDoc.data();
    
    res.json({
      success: true,
      availability: {
        inStock: productData.stock > 0,
        stock: productData.stock,
        isActive: productData.isActive,
        lowStock: productData.stock <= 10 && productData.stock > 0
      }
    });
  } catch (error) {
    console.error('Product availability check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check product availability'
    });
  }
});

module.exports = router;

