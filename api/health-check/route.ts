app.get('/api/health-check', async (req, res) => {
  try {
    const firebaseStatus = {
      firestore: admin.firestore ? 'connected' : 'not connected',
      auth: admin.auth ? 'connected' : 'not connected',
      storage: admin.storage ? 'connected' : 'not connected',
    }

    res.status(200).json({
      status: 'OK',
      message: 'Fragransia Backend is running',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        firebase: firebaseStatus,
        database: 'Firestore',
        auth: 'Firebase Auth',
        storage: 'Firebase Storage',
        payment: 'Razorpay',
      },
      projectId: process.env.FIREBASE_PROJECT_ID || 'fragransia-dbms',
      frontend: process.env.FRONTEND_URL || 'https://www.fragransia.in',
    })
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});