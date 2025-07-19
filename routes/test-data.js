const express = require('express');
const router = express.Router();

// Simple in-memory storage for development testing
let testProducts = [
  {
    id: "test-1",
    name: "Party mann",
    description: "A captivating fragrance with notes of Bergamot, Black Currant, Apple, Lemon, Pink Pepper, Pineapple, Patchouli, Moroccan Jasmine, Birch, Musk, Oakmoss, Ambroxan and Cedarwood.",
    price: 2999,
    originalPrice: 3499,
    size: "100ml",
    image: "/images/IMG-20250711-WA0005.jpg",
    category: "mens-fragrance",
    rating: 4.5,
    reviews: 25,
    discount: 14,
    stock: 50,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "test-2",
    name: "Blue man",
    description: "A sophisticated fragrance with notes of Calabrian bergamot, Pepper, Sichuan Pepper, Lavender, Pink Pepper, Vetiver, Patchouli, Geranium, Elemi, Ambroxan, Cedar and Labdanum.",
    price: 2499,
    originalPrice: 2899,
    size: "75ml",
    image: "/images/IMG-20250711-WA0006.jpg",
    category: "mens-fragrance",
    rating: 4.3,
    reviews: 18,
    discount: 14,
    stock: 75,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "test-3",
    name: "Amber Oud",
    description: "A warm and inviting fragrance with notes of Black Currant, Pineapple, Orange, Apple, Rose, Freesia, Heliotrope, Lily-of-the-Valley, Vanilla, Cedar, Sandalwood and Tonka Bean.",
    price: 1899,
    originalPrice: 2199,
    size: "50ml",
    image: "/images/IMG-20250711-WA0007.jpg",
    category: "unisex-fragrance",
    rating: 4.2,
    reviews: 32,
    discount: 14,
    stock: 100,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "test-4",
    name: "Ocean man",
    description: "A fresh and invigorating fragrance with notes of Apple, Plum, Lemon, Bergamot, Oakmoss, Geranium, Cinnamon, Mahogany, Carnation, Vanilla, Sandalwood, Cedar, Vetiver and Olive Tree.",
    price: 2199,
    originalPrice: 2599,
    size: "75ml",
    image: "/images/IMG-20250711-WA0008.jpg",
    category: "mens-fragrance",
    rating: 4.4,
    reviews: 21,
    discount: 15,
    stock: 60,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Get all test products
router.get('/', async (req, res) => {
  try {
    res.json({
      success: true,
      data: testProducts,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalProducts: testProducts.length,
        hasNextPage: false,
        hasPrevPage: false
      }
    });
  } catch (error) {
    console.error('Test products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test products'
    });
  }
});

// Get single test product
router.get('/:id', async (req, res) => {
  try {
    const product = testProducts.find(p => p.id === req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Test product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test product'
    });
  }
});

module.exports = router;

