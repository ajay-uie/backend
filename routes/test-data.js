const express = require('express');
const { db, admin } = require('../auth/firebaseConfig');

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

// POST /api/test-data/products - Generate test products
router.post('/products', async (req, res) => {
  try {
    const { count = 10 } = req.body;

    const testProducts = [];
    const categories = ['Perfume', 'Cologne', 'Body Spray', 'Deodorant', 'Fragrance Oil'];
    const brands = ['Chanel', 'Dior', 'Tom Ford', 'Versace', 'Calvin Klein', 'Hugo Boss'];

    for (let i = 1; i <= count; i++) {
      const product = {
        name: `Test Product ${i}`,
        brand: brands[Math.floor(Math.random() * brands.length)],
        category: categories[Math.floor(Math.random() * categories.length)],
        price: Math.floor(Math.random() * 5000) + 500,
        description: `This is a test product ${i} with amazing fragrance notes.`,
        stock: Math.floor(Math.random() * 100) + 10,
        sku: `TEST-${i.toString().padStart(3, '0')}`,
        images: [
          `https://via.placeholder.com/400x400?text=Product+${i}`,
          `https://via.placeholder.com/400x400?text=Product+${i}+Alt`
        ],
        isActive: true,
        isFeatured: Math.random() > 0.7,
        weight: Math.floor(Math.random() * 500) + 50,
        dimensions: {
          length: Math.floor(Math.random() * 20) + 5,
          width: Math.floor(Math.random() * 20) + 5,
          height: Math.floor(Math.random() * 30) + 10
        },
        tags: ['test', 'fragrance', 'sample'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await db.collection('products').add(product);
      testProducts.push({ id: docRef.id, ...product });
    }

    sendResponse(res, 201, true, {
      products: testProducts,
      count: testProducts.length
    }, `${count} test products created successfully`);

  } catch (error) {
    console.error('❌ Generate test products error:', error);
    sendResponse(res, 500, false, null, null, "Failed to generate test products", error.message);
  }
});

// POST /api/test-data/orders - Generate test orders
router.post('/orders', async (req, res) => {
  try {
    const { count = 5, userId } = req.body;

    if (!userId) {
      return sendResponse(res, 400, false, null, null, "User ID is required");
    }

    // Get some products to use in orders
    const productsSnapshot = await db.collection('products').limit(10).get();
    const products = [];
    productsSnapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });

    if (products.length === 0) {
      return sendResponse(res, 400, false, null, null, "No products found. Create products first.");
    }

    const testOrders = [];
    const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
    const paymentMethods = ['card', 'upi', 'netbanking', 'cod'];

    for (let i = 1; i <= count; i++) {
      // Select random products for this order
      const orderItems = [];
      const numItems = Math.floor(Math.random() * 3) + 1;
      
      for (let j = 0; j < numItems; j++) {
        const product = products[Math.floor(Math.random() * products.length)];
        const quantity = Math.floor(Math.random() * 3) + 1;
        
        orderItems.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity,
          total: product.price * quantity,
          image: product.images?.[0] || '',
          sku: product.sku || ''
        });
      }

      const subtotal = orderItems.reduce((sum, item) => sum + item.total, 0);
      const shipping = subtotal > 500 ? 0 : 50;
      const tax = Math.round(subtotal * 0.18);
      const total = subtotal + shipping + tax;

      const order = {
        orderId: `TEST-ORD-${Date.now()}-${i}`,
        userId,
        items: orderItems,
        pricing: {
          subtotal,
          shipping,
          tax,
          total,
          discount: 0
        },
        status: statuses[Math.floor(Math.random() * statuses.length)],
        paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
        paymentStatus: Math.random() > 0.3 ? 'paid' : 'pending',
        shippingAddress: {
          name: 'Test User',
          phone: '+91 9876543210',
          address: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          pincode: '123456',
          country: 'India'
        },
        notes: `Test order ${i}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await db.collection('orders').add(order);
      testOrders.push({ id: docRef.id, ...order });
    }

    sendResponse(res, 201, true, {
      orders: testOrders,
      count: testOrders.length
    }, `${count} test orders created successfully`);

  } catch (error) {
    console.error('❌ Generate test orders error:', error);
    sendResponse(res, 500, false, null, null, "Failed to generate test orders", error.message);
  }
});

// DELETE /api/test-data/reset - Reset all test data
router.delete('/reset', async (req, res) => {
  try {
    const { collections = ['products', 'orders'] } = req.body;

    const deletionResults = {};

    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).get();
      const batch = db.batch();
      
      let deleteCount = 0;
      snapshot.forEach(doc => {
        // Only delete test data (check for test indicators)
        const data = doc.data();
        if (data.sku?.startsWith('TEST-') || 
            data.orderId?.includes('TEST-') || 
            data.name?.includes('Test Product') ||
            data.tags?.includes('test')) {
          batch.delete(doc.ref);
          deleteCount++;
        }
      });

      if (deleteCount > 0) {
        await batch.commit();
      }
      
      deletionResults[collectionName] = deleteCount;
    }

    sendResponse(res, 200, true, {
      deletionResults,
      totalDeleted: Object.values(deletionResults).reduce((sum, count) => sum + count, 0)
    }, "Test data reset completed");

  } catch (error) {
    console.error('❌ Reset test data error:', error);
    sendResponse(res, 500, false, null, null, "Failed to reset test data", error.message);
  }
});

// GET /api/test-data - Get test data statistics
router.get('/', async (req, res) => {
  try {
    const collections = ['products', 'orders', 'users', 'reviews'];
    const stats = {};

    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).get();
      let testCount = 0;
      let totalCount = snapshot.size;

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.sku?.startsWith('TEST-') || 
            data.orderId?.includes('TEST-') || 
            data.name?.includes('Test Product') ||
            data.tags?.includes('test')) {
          testCount++;
        }
      });

      stats[collectionName] = {
        total: totalCount,
        test: testCount,
        real: totalCount - testCount
      };
    }

    sendResponse(res, 200, true, {
      statistics: stats,
      environment: process.env.NODE_ENV || 'development'
    }, "Test data statistics fetched successfully");

  } catch (error) {
    console.error('❌ Get test data stats error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch test data statistics", error.message);
  }
});

module.exports = router;

