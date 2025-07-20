const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let db;
let realtimeDb;
let firebaseAuth;
let isUsingFirebase = false;

// Sample data for initialization
const sampleData = {
  products: [
    {
      name: "Midnight Oud",
      description: "A rich and mysterious fragrance with notes of oud and rose. Perfect for evening wear.",
      price: 2999,
      originalPrice: 3499,
      category: "Oud",
      brand: "Fragransia",
      stock: 100,
      images: ["/images/amber-oud.jpg"],
      isFeatured: true,
      isActive: true,
      sku: "FRG-MO-001",
      weight: 100,
      size: "100ml",
      rating: 4.5,
      reviews: 25,
      tags: ["oud", "rose", "evening", "luxury"],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      name: "Rose Garden",
      description: "A delicate and fresh fragrance inspired by a blooming rose garden. Light and romantic.",
      price: 2499,
      originalPrice: 2999,
      category: "Floral",
      brand: "Fragransia",
      stock: 150,
      images: ["/images/1000425075.jpg"],
      isFeatured: true,
      isActive: true,
      sku: "FRG-RG-002",
      weight: 100,
      size: "100ml",
      rating: 4.3,
      reviews: 18,
      tags: ["rose", "floral", "romantic", "fresh"],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      name: "Ocean Breeze",
      description: "Fresh aquatic fragrance with marine notes. Perfect for summer days.",
      price: 1999,
      originalPrice: 2499,
      category: "Aquatic",
      brand: "Fragransia",
      stock: 200,
      images: ["/images/ocean-man.jpg"],
      isFeatured: false,
      isActive: true,
      sku: "FRG-OB-003",
      weight: 100,
      size: "100ml",
      rating: 4.1,
      reviews: 32,
      tags: ["aquatic", "fresh", "summer", "marine"],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      name: "Blue Elegance",
      description: "Sophisticated woody fragrance with hints of bergamot and cedar.",
      price: 3499,
      originalPrice: 3999,
      category: "Woody",
      brand: "Fragransia",
      stock: 75,
      images: ["/images/blue-man.jpg"],
      isFeatured: true,
      isActive: true,
      sku: "FRG-BE-004",
      weight: 100,
      size: "100ml",
      rating: 4.7,
      reviews: 41,
      tags: ["woody", "bergamot", "cedar", "sophisticated"],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      name: "Party Night",
      description: "Bold and energetic fragrance perfect for nightlife and special occasions.",
      price: 2799,
      originalPrice: 3299,
      category: "Oriental",
      brand: "Fragransia",
      stock: 120,
      images: ["/images/party-man.jpg"],
      isFeatured: false,
      isActive: true,
      sku: "FRG-PN-005",
      weight: 100,
      size: "100ml",
      rating: 4.4,
      reviews: 29,
      tags: ["oriental", "bold", "nightlife", "energetic"],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      name: "Golden Amber",
      description: "Warm and luxurious amber fragrance with vanilla and sandalwood notes.",
      price: 3999,
      originalPrice: 4499,
      category: "Amber",
      brand: "Fragransia",
      stock: 60,
      images: ["/images/1000425077.jpg"],
      isFeatured: true,
      isActive: true,
      sku: "FRG-GA-006",
      weight: 100,
      size: "100ml",
      rating: 4.8,
      reviews: 37,
      tags: ["amber", "vanilla", "sandalwood", "luxury"],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      name: "Citrus Burst",
      description: "Vibrant citrus fragrance with lemon, orange, and grapefruit notes.",
      price: 1799,
      originalPrice: 2199,
      category: "Citrus",
      brand: "Fragransia",
      stock: 180,
      images: ["/images/1000425079.jpg"],
      isFeatured: false,
      isActive: true,
      sku: "FRG-CB-007",
      weight: 100,
      size: "100ml",
      rating: 4.2,
      reviews: 22,
      tags: ["citrus", "lemon", "orange", "vibrant"],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      name: "Mystic Woods",
      description: "Deep forest fragrance with pine, cedar, and moss notes. Earthy and grounding.",
      price: 2899,
      originalPrice: 3399,
      category: "Woody",
      brand: "Fragransia",
      stock: 90,
      images: ["/images/1000425081.jpg"],
      isFeatured: false,
      isActive: true,
      sku: "FRG-MW-008",
      weight: 100,
      size: "100ml",
      rating: 4.6,
      reviews: 33,
      tags: ["woody", "pine", "cedar", "earthy"],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  ],
  categories: [
    { name: 'Oud', description: 'Rich and luxurious oud fragrances', isActive: true },
    { name: 'Floral', description: 'Fresh and romantic floral scents', isActive: true },
    { name: 'Aquatic', description: 'Fresh marine and aquatic fragrances', isActive: true },
    { name: 'Woody', description: 'Sophisticated woody and earthy scents', isActive: true },
    { name: 'Oriental', description: 'Bold and exotic oriental fragrances', isActive: true },
    { name: 'Amber', description: 'Warm and luxurious amber scents', isActive: true },
    { name: 'Citrus', description: 'Vibrant and energizing citrus fragrances', isActive: true }
  ]
};

try {
  if (!admin.apps.length) {
    // Initialize Firebase Admin with service account or default credentials
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
      // Production: Use service account key
      const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('ascii'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      });
      console.log('🔥 Firebase initialized with service account');
      isUsingFirebase = true;
    } else if (process.env.FIREBASE_PROJECT_ID) {
      // Development: Use project ID
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      });
      console.log('🔥 Firebase initialized with project ID');
      isUsingFirebase = true;
    } else {
      // Try default initialization
      admin.initializeApp();
      console.log('🔥 Firebase initialized with default credentials');
      isUsingFirebase = true;
    }
    
    if (isUsingFirebase) {
      db = admin.firestore();
      realtimeDb = admin.database();
      firebaseAuth = admin.auth();
      
      // Initialize sample data
      initializeSampleData();
      
      // Set up real-time listeners
      setupRealtimeListeners();
    }
  } else {
    db = admin.firestore();
    realtimeDb = admin.database();
    firebaseAuth = admin.auth();
    isUsingFirebase = true;
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  console.log('🔄 Falling back to mock Firebase');
  isUsingFirebase = false;
  
  // Create mock implementations
  db = createMockFirestore();
  realtimeDb = createMockRealtimeDb();
  firebaseAuth = createMockAuth();
}

// Initialize sample data in Firebase
async function initializeSampleData() {
  try {
    // Check if products already exist
    const productsSnapshot = await db.collection('products').limit(1).get();
    
    if (productsSnapshot.empty) {
      console.log('📦 Initializing sample data in Firebase...');
      
      // Add products using batch
      const batch = db.batch();
      sampleData.products.forEach((product) => {
        const docRef = db.collection('products').doc();
        batch.set(docRef, product);
      });
      await batch.commit();
      console.log('✅ Sample products added to Firestore');
      
      // Add categories
      const categoryBatch = db.batch();
      sampleData.categories.forEach((category) => {
        const docRef = db.collection('categories').doc();
        categoryBatch.set(docRef, {
          ...category,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      await categoryBatch.commit();
      console.log('✅ Sample categories added to Firestore');
      
      // Initialize settings
      const defaultSettings = {
        siteName: 'Fragransia',
        siteDescription: 'Premium Fragrances for Every Occasion',
        currency: 'INR',
        shippingFee: 99,
        freeShippingThreshold: 2000,
        taxRate: 18,
        contactEmail: 'contact@fragransia.com',
        supportPhone: '+91 9876543210',
        address: 'Mumbai, Maharashtra, India',
        socialMedia: {
          facebook: '',
          instagram: '',
          twitter: '',
          youtube: ''
        },
        paymentMethods: ['razorpay', 'cod'],
        features: {
          wishlist: true,
          reviews: true,
          coupons: true,
          notifications: true
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('settings').doc('site-settings').set(defaultSettings);
      console.log('✅ Default settings added to Firestore');
      
      // Initialize real-time database structure
      await realtimeDb.ref('analytics').set({
        visitors: 0,
        pageViews: 0,
        orders: 0,
        revenue: 0,
        lastUpdated: admin.database.ServerValue.TIMESTAMP
      });
      
      await realtimeDb.ref('notifications').set({
        admin: [],
        users: {}
      });
      
      console.log('✅ Real-time database initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing sample data:', error);
  }
}

// Set up real-time listeners for analytics and notifications
function setupRealtimeListeners() {
  try {
    // Listen for order changes to update analytics
    db.collection('orders').onSnapshot((snapshot) => {
      let totalOrders = 0;
      let totalRevenue = 0;
      
      snapshot.forEach(doc => {
        const order = doc.data();
        totalOrders++;
        totalRevenue += order.total || 0;
      });
      
      // Update real-time database
      realtimeDb.ref('analytics').update({
        orders: totalOrders,
        revenue: totalRevenue,
        lastUpdated: admin.database.ServerValue.TIMESTAMP
      });
    });
    
    console.log('✅ Real-time listeners set up');
  } catch (error) {
    console.error('❌ Error setting up real-time listeners:', error);
  }
}

// Mock implementations for fallback
function createMockFirestore() {
  const mockData = {
    products: sampleData.products.map((p, i) => ({ ...p, id: `prod-${i + 1}` })),
    categories: sampleData.categories.map((c, i) => ({ ...c, id: `cat-${i + 1}` })),
    users: [],
    orders: [],
    settings: [{
      id: 'site-settings',
      siteName: 'Fragransia',
      siteDescription: 'Premium Fragrances for Every Occasion',
      currency: 'INR',
      shippingFee: 99,
      freeShippingThreshold: 2000
    }]
  };

  return {
    collection: (name) => ({
      get: () => {
        const data = mockData[name] || [];
        return Promise.resolve({
          size: data.length,
          empty: data.length === 0,
          docs: data.map(item => ({
            id: item.id,
            data: () => item,
            exists: true
          })),
          forEach: (callback) => {
            data.forEach((item) => {
              callback({
                id: item.id,
                data: () => item,
                exists: true
              });
            });
          }
        });
      },
      doc: (id) => ({
        get: () => {
          const data = mockData[name] || [];
          const item = data.find(d => d.id === id);
          return Promise.resolve({
            exists: !!item,
            data: () => item || {},
            id: id
          });
        },
        set: (data) => {
          if (!mockData[name]) mockData[name] = [];
          const existingIndex = mockData[name].findIndex(item => item.id === id);
          const newData = { ...data, id };
          if (existingIndex >= 0) {
            mockData[name][existingIndex] = newData;
          } else {
            mockData[name].push(newData);
          }
          return Promise.resolve({ writeTime: new Date() });
        },
        update: (data) => {
          if (!mockData[name]) mockData[name] = [];
          const existingIndex = mockData[name].findIndex(item => item.id === id);
          if (existingIndex >= 0) {
            mockData[name][existingIndex] = { ...mockData[name][existingIndex], ...data };
          }
          return Promise.resolve({ writeTime: new Date() });
        },
        delete: () => {
          if (mockData[name]) {
            mockData[name] = mockData[name].filter(item => item.id !== id);
          }
          return Promise.resolve({ writeTime: new Date() });
        }
      }),
      add: (data) => {
        const id = 'mock-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        if (!mockData[name]) mockData[name] = [];
        const newData = { ...data, id };
        mockData[name].push(newData);
        return Promise.resolve({ id, writeTime: new Date() });
      },
      where: (field, op, value) => ({
        get: () => {
          const data = mockData[name] || [];
          let filtered = data.filter(item => {
            if (op === '==') return item[field] === value;
            if (op === '!=') return item[field] !== value;
            if (op === '>') return item[field] > value;
            if (op === '>=') return item[field] >= value;
            if (op === '<') return item[field] < value;
            if (op === '<=') return item[field] <= value;
            return true;
          });
          
          return Promise.resolve({
            size: filtered.length,
            empty: filtered.length === 0,
            docs: filtered.map(item => ({
              id: item.id,
              data: () => item,
              exists: true
            })),
            forEach: (callback) => {
              filtered.forEach((item) => {
                callback({
                  id: item.id,
                  data: () => item,
                  exists: true
                });
              });
            }
          });
        },
        orderBy: (field, direction = 'asc') => ({
          get: () => this.get(),
          limit: (count) => ({ get: () => this.get() })
        }),
        limit: (count) => ({ get: () => this.get() })
      }),
      orderBy: (field, direction = 'asc') => ({
        get: () => {
          const data = mockData[name] || [];
          const sorted = [...data].sort((a, b) => {
            const aVal = a[field];
            const bVal = b[field];
            
            if (aVal instanceof Date && bVal instanceof Date) {
              return direction === 'asc' ? aVal.getTime() - bVal.getTime() : bVal.getTime() - aVal.getTime();
            }
            
            if (typeof aVal === 'string' && typeof bVal === 'string') {
              return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            
            if (typeof aVal === 'number' && typeof bVal === 'number') {
              return direction === 'asc' ? aVal - bVal : bVal - aVal;
            }
            
            return 0;
          });
          
          return Promise.resolve({
            size: sorted.length,
            empty: sorted.length === 0,
            docs: sorted.map(item => ({
              id: item.id,
              data: () => item,
              exists: true
            })),
            forEach: (callback) => {
              sorted.forEach((item) => {
                callback({
                  id: item.id,
                  data: () => item,
                  exists: true
                });
              });
            }
          });
        },
        limit: (count) => ({ get: () => this.get() }),
        where: (field, op, value) => ({ get: () => this.get() })
      }),
      limit: (count) => ({ get: () => this.get() }),
      onSnapshot: (callback) => {
        // Mock snapshot listener
        setTimeout(() => {
          callback({
            size: mockData[name]?.length || 0,
            forEach: (cb) => {
              (mockData[name] || []).forEach(item => cb({ data: () => item }));
            }
          });
        }, 100);
        return () => {}; // Unsubscribe function
      }
    }),
    batch: () => ({
      set: () => Promise.resolve(),
      update: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      commit: () => Promise.resolve([])
    })
  };
}

function createMockRealtimeDb() {
  const mockRealtimeData = {
    analytics: {
      visitors: 0,
      pageViews: 0,
      orders: 0,
      revenue: 0
    },
    notifications: {
      admin: [],
      users: {}
    }
  };

  return {
    ref: (path) => ({
      set: (data) => {
        mockRealtimeData[path] = data;
        return Promise.resolve();
      },
      update: (data) => {
        mockRealtimeData[path] = { ...mockRealtimeData[path], ...data };
        return Promise.resolve();
      },
      once: (eventType) => {
        return Promise.resolve({
          val: () => mockRealtimeData[path]
        });
      },
      on: (eventType, callback) => {
        setTimeout(() => callback({ val: () => mockRealtimeData[path] }), 100);
      },
      off: () => {},
      push: (data) => {
        const key = 'mock-' + Date.now();
        if (!mockRealtimeData[path]) mockRealtimeData[path] = {};
        mockRealtimeData[path][key] = data;
        return Promise.resolve({ key });
      }
    })
  };
}

function createMockAuth() {
  return {
    createUser: (userData) => Promise.resolve({
      uid: 'mock-uid-' + Date.now(),
      email: userData.email,
      emailVerified: false,
      disabled: false,
      metadata: {
        creationTime: new Date().toISOString(),
        lastSignInTime: null
      }
    }),
    getUserByEmail: (email) => Promise.resolve({
      uid: 'mock-uid-' + Date.now(),
      email: email,
      emailVerified: false,
      disabled: false
    }),
    updateUser: (uid, userData) => Promise.resolve({
      uid: uid,
      ...userData
    }),
    deleteUser: (uid) => Promise.resolve(),
    verifyIdToken: (token) => Promise.resolve({
      uid: 'mock-uid',
      email: 'mock@example.com'
    }),
    createCustomToken: (uid, claims) => Promise.resolve('mock-custom-token'),
    setCustomUserClaims: (uid, claims) => Promise.resolve()
  };
}

module.exports = { 
  db, 
  realtimeDb, 
  firebaseAuth, 
  admin, 
  isUsingFirebase 
};

