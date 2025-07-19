const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let db;
let firebaseAuth;

try {
  if (!admin.apps.length) {
    // In production, use service account key
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
      const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('ascii'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      });
      console.log('Firebase initialized with service account');
    } else {
      // For development, use mock database
      console.warn('Firebase service account not configured, using mock database for development');
    }
  }
  
  // Initialize Firestore and Auth
  if (admin.apps.length > 0) {
    db = admin.firestore();
    firebaseAuth = admin.auth();
  } else {
    // Mock database for development
    db = createMockDatabase();
    firebaseAuth = createMockAuth();
  }
} catch (error) {
  console.error('Firebase initialization error:', error);
  // Fallback to mock database
  db = createMockDatabase();
  firebaseAuth = createMockAuth();
}

function createMockDatabase() {
  return {
    collection: (name) => ({
      get: () => Promise.resolve({ 
        size: 0, 
        forEach: () => {}, 
        docs: [],
        empty: true
      }),
      doc: (id) => ({
        get: () => Promise.resolve({ 
          exists: false, 
          data: () => ({}),
          id: id || 'mock-id'
        }),
        set: (data) => Promise.resolve({ writeTime: new Date() }),
        update: (data) => Promise.resolve({ writeTime: new Date() }),
        delete: () => Promise.resolve({ writeTime: new Date() })
      }),
      add: (data) => Promise.resolve({ 
        id: 'mock-id-' + Date.now(),
        writeTime: new Date()
      }),
      where: (field, op, value) => ({
        get: () => Promise.resolve({ 
          size: 0, 
          forEach: () => {}, 
          docs: [],
          empty: true
        }),
        orderBy: () => createMockDatabase().collection(name),
        limit: () => createMockDatabase().collection(name)
      }),
      orderBy: (field, direction) => createMockDatabase().collection(name),
      limit: (count) => createMockDatabase().collection(name),
      startAfter: (doc) => createMockDatabase().collection(name)
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
    })
  };
}

module.exports = { db, admin, firebaseAuth };

