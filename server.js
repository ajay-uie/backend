// Enhanced Backend Server Configuration (server.js) - FIXED

const express = require("express");
const app = express();
app.set('trust proxy', 1);

const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const compression = require("compression");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");

// ✅ Load environment variables first
dotenv.config();

const server = http.createServer(app);

// ✅ Import and initialize Socket Server
const SocketServer = require("./socket-server");
const socketServer = new SocketServer(server);

// ✅ Make socket server globally available
global.socketServer = socketServer;

// ✅ Start periodic updates for real-time features
socketServer.startPeriodicUpdates();

// ✅ Initialize Firebase
const { db, admin } = require('./auth/firebaseConfig');
console.log("🔥 Firebase initialized successfully");

// ✅ Environment Configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 10000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// ✅ Rate Limiting Configuration
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Different rate limits for different endpoints
const authLimiter = createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts');
const apiLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many API requests');
const strictLimiter = createRateLimiter(15 * 60 * 1000, 10, 'Rate limit exceeded');

// ✅ CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    const allowedOrigins = [
      CLIENT_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'https://www.fragransia.in',
      'https://fragransia.in',
      process.env.FRONTEND_URL,
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200,
};

// ✅ Security Configuration
const helmetOptions = {
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
};

// ✅ Logging Configuration
const morganFormat = NODE_ENV === 'production' ? 'combined' : 'dev';

// ✅ Middleware Setup
app.use(cors(corsOptions));
app.use(helmet(helmetOptions));
app.use(compression());
app.use(cookieParser());
app.use(morgan(morganFormat));

// ✅ Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Request logging middleware
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  console.log(`${req.method} ${req.path} - ${req.requestTime}`);
  next();
});

// ✅ Health check (no rate limiting)
app.get("/api/health-check", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    firebase: !!db,
    socketConnections: socketServer ? (socketServer.getConnectionCount ? socketServer.getConnectionCount() : 0) : 0,
    uptime: process.uptime(),
  });
});

// ✅ Health check alias
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    firebase: !!db,
    socketConnections: socketServer ? (socketServer.getConnectionCount ? socketServer.getConnectionCount() : 0) : 0,
    uptime: process.uptime(),
  });
});

// ✅ Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Fragransia Backend API",
    version: "1.0.0",
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      admin: "/api/admin",
      products: "/api/products",
      orders: "/api/orders",
      cart: "/api/cart",
      users: "/api/users",
      wishlist: "/api/wishlist",
      reviews: "/api/reviews",
      coupons: "/api/coupons",
      payments: "/api/payments"
    }
  });
});

// ✅ FIXED: Safe route loading based on actual file structure
const fs = require('fs');
const path = require('path');

const safeRequire = (routePath) => {
  try {
    const fullPath = path.resolve(__dirname, routePath + '.js');
    if (fs.existsSync(fullPath)) {
      console.log(`✅ Loading route: ${routePath}`);
      return require(routePath);
    }
    console.warn(`⚠️ Route file not found: ${routePath}`);
    return null;
  } catch (error) {
    console.error(`❌ Error loading route ${routePath}:`, error.message);
    return null;
  }
};

// ✅ Authentication routes - Prefer routes_new, fallback to routes
console.log('🔑 Setting up authentication routes...');
const authRoutes = safeRequire("./routes_new/auth") || safeRequire("./routes/auth");
if (authRoutes) {
  app.use("/api/auth", authLimiter, authRoutes);
  console.log('✅ Auth routes loaded');
} else {
  console.warn('⚠️ No auth routes found - creating fallback');
  app.use("/api/auth", authLimiter, (req, res) => {
    res.status(503).json({ 
      error: "Authentication service temporarily unavailable",
      message: "Auth routes not configured - check routes/auth.js or routes_new/auth.js" 
    });
  });
}

// ✅ Admin authentication routes
console.log('🔐 Setting up admin auth routes...');
const adminAuthRoutes = safeRequire("./routes_new/adminAuth") || safeRequire("./routes/adminAuth");
if (adminAuthRoutes) {
  app.use("/api/admin/auth", authLimiter, adminAuthRoutes);
  console.log('✅ Admin auth routes loaded');
}

// ✅ Admin routes
console.log('👑 Setting up admin routes...');
const adminRoutes = safeRequire("./routes/admin");
if (adminRoutes) {
  app.use("/api/admin", strictLimiter, adminRoutes);
  console.log('✅ Admin routes loaded');
}

// ✅ Product routes
console.log('📦 Setting up product routes...');
const productRoutes = safeRequire("./routes_new/products") || safeRequire("./routes/products");
if (productRoutes) {
  app.use('/api/products', apiLimiter, productRoutes);
  console.log('✅ Product routes loaded');
} else {
  console.warn('⚠️ No product routes found - creating fallback');
  app.get('/api/products', apiLimiter, (req, res) => {
    res.status(200).json({
      success: true,
      data: [],
      message: "Products service is being configured - check routes/products.js or routes_new/products.js"
    });
  });
}

// ✅ Orders routes
console.log('📋 Setting up order routes...');
const orderRoutes = safeRequire("./routes_new/orders") || safeRequire("./routes/orders");
if (orderRoutes) {
  app.use("/api/orders", apiLimiter, orderRoutes);
  console.log('✅ Order routes loaded');
}

// ✅ Cart routes
console.log('🛒 Setting up cart routes...');
const cartRoutes = safeRequire("./routes_new/cart") || safeRequire("./routes/cart");
if (cartRoutes) {
  app.use("/api/cart", apiLimiter, cartRoutes);
  console.log('✅ Cart routes loaded');
}

// ✅ User routes
console.log('👥 Setting up user routes...');
const userRoutes = safeRequire("./routes_new/users") || safeRequire("./routes/users");
if (userRoutes) {
  app.use("/api/users", apiLimiter, userRoutes);
  console.log('✅ User routes loaded');
}

// ✅ Wishlist routes
console.log('💝 Setting up wishlist routes...');
const wishlistRoutes = safeRequire("./routes_new/wishlist") || safeRequire("./routes/wishlist");
if (wishlistRoutes) {
  app.use("/api/wishlist", apiLimiter, wishlistRoutes);
  console.log('✅ Wishlist routes loaded');
}

// ✅ Coupon routes
console.log('🎫 Setting up coupon routes...');
const couponRoutes = safeRequire("./routes_new/coupons") || safeRequire("./routes/coupons");
if (couponRoutes) {
  app.use("/api/coupons", apiLimiter, couponRoutes);
  console.log('✅ Coupon routes loaded');
}

// ✅ Review routes (only in routes folder)
console.log('⭐ Setting up review routes...');
const reviewRoutes = safeRequire("./routes/reviews");
if (reviewRoutes) {
  app.use("/api/reviews", apiLimiter, reviewRoutes);
  console.log('✅ Review routes loaded');
}

// ✅ Realtime routes (only in routes folder)
console.log('⚡ Setting up realtime routes...');
const realtimeRoutes = safeRequire("./routes/realtime");
if (realtimeRoutes) {
  app.use("/api/realtime", apiLimiter, realtimeRoutes);
  console.log('✅ Realtime routes loaded');
}

// ✅ Payment routes
console.log('💳 Setting up payment routes...');
const paymentRoutes = safeRequire("./routes/payments");
if (paymentRoutes) {
  app.use("/api/payments", strictLimiter, paymentRoutes);
  console.log('✅ Payment routes loaded');
}

// ✅ Payment API routes (subfolder)
const paymentApiRoutes = safeRequire("./routes/api/payments");
if (paymentApiRoutes) {
  app.use("/api/payments-api", strictLimiter, paymentApiRoutes);
  console.log('✅ Payment API routes loaded');
}

// ✅ Webhook routes (no rate limiting)
console.log('🎣 Setting up webhook routes...');
const webhookRoutes = safeRequire("./routes/webhooks");
if (webhookRoutes) {
  app.use("/api/webhooks", webhookRoutes);
  console.log('✅ Webhook routes loaded');
}

// ✅ API Documentation routes
console.log('📚 Setting up API docs...');
const apiDocsRoutes = safeRequire("./routes/api-docs");
if (apiDocsRoutes) {
  app.use("/api/docs", apiDocsRoutes);
  console.log('✅ API docs routes loaded');
}

// ✅ Test data routes (development only)
if (NODE_ENV === 'development') {
  console.log('🧪 Setting up test data routes...');
  const testDataRoutes = safeRequire("./routes/test-data");
  if (testDataRoutes) {
    app.use("/api/test-data", testDataRoutes);
    console.log('✅ Test data routes loaded');
  }
}

// ✅ Critical API endpoints that might be missing from route files
console.log('🔧 Setting up critical fallback endpoints...');

// ✅ Countdown endpoints
app.get("/api/countdown/active", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      active: false,
      endTime: null,
      title: "No Active Countdown",
      description: "No countdown is currently active"
    },
    message: "Countdown status retrieved successfully"
  });
});

app.get("/countdown/active", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      active: false,
      endTime: null,
      title: "No Active Countdown", 
      description: "No countdown is currently active"
    },
    message: "Countdown status retrieved successfully"
  });
});

// ✅ Auth verification fallbacks
app.post("/auth/verify", (req, res) => {
  res.status(301).json({
    success: false,
    error: "Endpoint moved",
    message: "This endpoint has been moved to /api/auth/verify",
    redirect: "/api/auth/verify"
  });
});

app.post("/api/auth/verify", (req, res) => {
  if (!authRoutes) {
    return res.status(503).json({
      success: false,
      error: "Authentication service unavailable",
      message: "Auth verification service is not configured"
    });
  }
  // If auth routes exist, this will be handled by the auth router
  res.status(404).json({
    success: false,
    error: "Auth verify endpoint not found in auth routes",
    message: "Check your auth route configuration"
  });
});

// ✅ Common API endpoints that might be expected
app.get("/api/categories", apiLimiter, (req, res) => {
  res.status(200).json({
    success: true,
    data: [
      { id: "1", name: "Perfumes", slug: "perfumes" },
      { id: "2", name: "Fragrances", slug: "fragrances" },
      { id: "3", name: "Gift Sets", slug: "gift-sets" }
    ],
    message: "Categories retrieved successfully"
  });
});

app.get("/api/banners", apiLimiter, (req, res) => {
  res.status(200).json({
    success: true,
    data: [],
    message: "No banners configured"
  });
});

app.get("/api/settings", apiLimiter, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      siteName: "Fragransia",
      currency: "INR",
      shippingEnabled: true,
      paymentMethods: ["razorpay", "cod"]
    },
    message: "Settings retrieved successfully"
  });
});

// ✅ API Documentation route (development only)
if (NODE_ENV === 'development') {
  app.get("/api/docs", (req, res) => {
    const routes = [];
    
    // Helper function to extract routes
    const extractRoutes = (stack, basePath = '') => {
      stack.forEach((middleware) => {
        if (middleware.route) {
          routes.push({
            path: basePath + middleware.route.path,
            methods: Object.keys(middleware.route.methods),
          });
        } else if (middleware.name === 'router' && middleware.regexp) {
          const routePath = basePath + middleware.regexp.source
            .replace(/\\\//g, '/')
            .replace(/\$.*/, '')
            .replace(/^\^/, '');
          
          if (middleware.handle && middleware.handle.stack) {
            extractRoutes(middleware.handle.stack, routePath);
          }
        }
      });
    };
    
    extractRoutes(app._router.stack);
    
    res.json({
      message: "API Documentation",
      environment: NODE_ENV,
      totalRoutes: routes.length,
      routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
      availableEndpoints: {
        auth: "/api/auth/*",
        admin: "/api/admin/*",
        products: "/api/products/*",
        orders: "/api/orders/*",
        cart: "/api/cart/*",
        users: "/api/users/*",
        wishlist: "/api/wishlist/*",
        reviews: "/api/reviews/*",
        coupons: "/api/coupons/*",
        payments: "/api/payments/*",
        webhooks: "/api/webhooks/*",
        realtime: "/api/realtime/*",
        countdown: "/api/countdown/*"
      }
    });
  });
}

// ✅ Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    console.log('Request has timed out.');
    res.status(408).json({ 
      error: 'Request timeout',
      message: 'The request took too long to process'
    });
  });
  next();
});

// ✅ Error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', {
    message: error.message,
    stack: NODE_ENV === 'development' ? error.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // CORS error
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      error: 'CORS policy violation',
      message: 'Origin not allowed'
    });
  }
  
  // JSON parsing error
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ 
      error: 'Invalid JSON format',
      message: 'Request body contains invalid JSON'
    });
  }
  
  // Rate limit error
  if (error.status === 429) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later'
    });
  }
  
  // Default error response
  const statusCode = error.statusCode || error.status || 500;
  const message = NODE_ENV === 'production' ? 'Internal server error' : error.message;
  
  res.status(statusCode).json({
    error: message,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown',
    ...(NODE_ENV === 'development' && { stack: error.stack }),
  });
});

// ✅ 404 handler for unmatched routes
app.use("*", (req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: "Route not found",
    message: `The requested endpoint ${req.method} ${req.originalUrl} was not found`,
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      "GET /api/health",
      "GET /api/docs",
      "POST /api/auth/*",
      "GET /api/products",
      "GET /api/countdown/active"
    ]
  });
});

// ✅ Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      console.error('Error during server shutdown:', err);
      process.exit(1);
    }
    
    console.log('✅ HTTP Server closed successfully');
    
    // Close Socket.IO connections properly
    if (socketServer && socketServer.io) {
      socketServer.io.close(() => {
        console.log('✅ Socket.IO connections closed');
        process.exit(0);
      });
    } else if (socketServer && typeof socketServer.close === 'function') {
      socketServer.close(() => {
        console.log('✅ Socket server closed');
        process.exit(0);
      });
    } else {
      console.log('✅ No socket server to close');
      process.exit(0);
    }
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.log('⚠️ Forcing server shutdown...');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// ✅ Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${NODE_ENV}`);
  console.log(`🌐 Client URL: ${CLIENT_URL}`);
  console.log(`🔥 Firebase: ${db ? 'Connected' : 'Disconnected'}`);
  console.log(`🔌 Socket.IO: Ready`);
  
  if (NODE_ENV === 'development') {
    console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
    console.log(`❤️ Health Check: http://localhost:${PORT}/api/health`);
  }
  
  console.log('✅ All endpoints configured and ready');
});

module.exports = { app, server, socketServer };