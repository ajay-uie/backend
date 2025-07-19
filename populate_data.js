const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, "base64").toString("ascii"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const db = admin.firestore();

async function populateDummyData() {
  console.log("Populating dummy data...");

  // Add dummy products
  const productsRef = db.collection("products");
  const product1 = {
    name: "Midnight Oud",
    description: "A rich and mysterious fragrance with notes of oud and rose.",
    price: 2999,
    category: "Oud",
    stock: 100,
    imageUrl: "/images/midnight-oud.jpg",
    isFeatured: true,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  const product2 = {
    name: "Rose Garden",
    description: "A delicate and fresh fragrance inspired by a blooming rose garden.",
    price: 2499,
    category: "Floral",
    stock: 150,
    imageUrl: "/images/rose-garden.jpg",
    isFeatured: true,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  const product3 = {
    name: "Citrus Burst",
    description: "A vibrant and energetic scent with zesty citrus notes.",
    price: 1899,
    category: "Citrus",
    stock: 80,
    imageUrl: "/images/citrus-burst.jpg",
    isFeatured: false,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await productsRef.add(product1);
  await productsRef.add(product2);
  await productsRef.add(product3);
  console.log("Dummy products added.");

  // Add dummy admin dashboard data (if it doesn't exist)
  const dashboardRef = db.collection("admin").doc("dashboard");
  const dashboardDoc = await dashboardRef.get();

  if (!dashboardDoc.exists) {
    const dashboardData = {
      totalRevenue: 125000,
      totalOrders: 450,
      totalCustomers: 280,
      totalProducts: 25,
      recentOrders: [
        { id: "ORD-001", customer: "John Doe", amount: 2999, status: "pending" },
        { id: "ORD-002", customer: "Jane Smith", amount: 1599, status: "confirmed" }
      ],
      lowStockProducts: [
        { id: "PROD-001", name: "Midnight Oud", stock: 5 },
        { id: "PROD-002", name: "Rose Garden", stock: 3 }
      ],
      systemStats: {
        serverUptime: 99.8,
        responseTime: 234,
        errorRate: "0.51",
        activeUsers: 0,
        memoryUsage: 57,
        cpuUsage: 16
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    await dashboardRef.set(dashboardData);
    console.log("Dummy dashboard data added.");
  } else {
    console.log("Dashboard data already exists, skipping.");
  }

  console.log("Dummy data population complete.");
}

populateDummyData().catch(console.error);


