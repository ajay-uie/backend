// Enhanced Backend Server Configuration (server.js)

const express = require("express");
const app = express();              // ✅ only once!
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

// ✅ CORS Configuration - FIXED TO ALLOW ALL ORIGINS FOR DEVELOPMENT
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    // For development, allow all origins
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
      callback(null, true); // Allow all for now - can be restricted later
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
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '10mb' }));

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

// ✅ Health check alias (for frontend compatibility)
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

// ✅ Missing Countdown API Routes
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

// ✅ Non-prefixed countdown route for backward compatibility
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

// ✅ Non-prefixed auth verify route for backward compatibility
app.post("/auth/verify", (req, res) => {
  // Redirect to the proper API endpoint
  res.status(200).json({
    success: false,
    error: "Please use /api/auth/verify endpoint",
    message: "This endpoint has been moved to /api/auth/verify"
  });
});

// ✅ Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Fragransia Backend API - Dual Routing Enabled",
    version: "2.0.0",
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    routing: {
      type: "dual",
      description: "Both original and new routes are available"
    },
    endpoints: {
      // Primary endpoints (new routes)
      health: "/api/health",
      docs: "/api/docs",
      auth: "/api/auth",
      admin: "/api/admin",
      products: "/api/products",
      orders: "/api/orders",
      cart: "/api/cart",
      users: "/api/users",
      wishlist: "/api/wishlist",
      reviews: "/api/reviews",
      coupons: "/api/coupons",
      payments: "/api/payments",
      // Legacy endpoints (original routes)
      "auth-legacy": "/api/auth-legacy",
      "admin-auth-legacy": "/api/admin/auth-legacy",
      "products-legacy": "/api/products-legacy",
      "orders-legacy": "/api/orders-legacy",
      "cart-legacy": "/api/cart-legacy",
      "users-legacy": "/api/users-legacy",
      "wishlist-legacy": "/api/wishlist-legacy",
      "coupons-legacy": "/api/coupons-legacy"
    }
  });
});

// ✅ API Documentation route
app.use("/api/docs", require("./routes/api-docs"));

// ========== API Routes with appropriate rate limiting - UPDATED ROUTING ==========

// ========== AUTHENTICATION ROUTES ==========
// New routes (primary)
app.use("/api/auth", authLimiter, require("./routes_new/auth"));
app.use("/api/admin/auth", authLimiter, require("./routes_new/adminAuth"));

// ========== ADMIN ROUTES ==========
// New admin routes (primary)
app.use("/api/admin", strictLimiter, require("./routes_new/admin"));

// ========== PUBLIC API ROUTES ==========
// New routes (primary)
app.use('/api/products', apiLimiter, require('./routes_new/products'));
app.use("/api/orders", apiLimiter, require("./routes_new/orders"));
app.use("/api/cart", apiLimiter, require("./routes_new/cart"));
app.use("/api/users", apiLimiter, require("./routes_new/users"));
app.use("/api/wishlist", apiLimiter, require("./routes_new/wishlist"));
app.use("/api/coupons", apiLimiter, require("./routes_new/coupons"));

// ========== NEW ROUTES ==========
// Reviews routes
app.use("/api/reviews", apiLimiter, require("./routes_new/reviews"));

// Payment routes
app.use("/api/payments", strictLimiter, require("./routes_new/payments"));

// Auth Enhanced routes
app.use("/api/auth-enhanced", authLimiter, require("./routes_new/auth-enhanced"));

// Payments API routes
app.use("/api/payments-api", strictLimiter, require("./routes_new/payments-api"));

// Realtime routes (original)
app.use("/api/realtime", apiLimiter, require("./routes/realtime"));

// Webhook routes (original)
app.use("/api/webhooks", require("./routes/webhooks"));

// ========== LEGACY ROUTES (BACKUP) ==========
// Original routes (legacy support with different prefixes)
app.use("/api/auth-legacy", authLimiter, require("./routes/auth"));
app.use("/api/admin/auth-legacy", authLimiter, require("./routes/adminAuth"));
app.use('/api/products-legacy', apiLimiter, require('./routes/products'));
app.use("/api/orders-legacy", apiLimiter, require("./routes/orders"));
app.use("/api/cart-legacy", apiLimiter, require("./routes/cart"));
app.use("/api/users-legacy", apiLimiter, require("./routes/users"));
app.use("/api/wishlist-legacy", apiLimiter, require("./routes/wishlist"));
app.use("/api/coupons-legacy", apiLimiter, require("./routes/coupons"));

// ========== EXTRA ROUTES (NEW FEATURES) ==========
// Analytics routes
app.use("/api/analytics", apiLimiter, require("./routes_extra/analytics"));

// Notifications routes
app.use("/api/notifications", apiLimiter, require("./routes_extra/notifications"));

// Inventory management routes
app.use("/api/inventory", apiLimiter, require("./routes_extra/inventory"));

// Shipping routes
app.use("/api/shipping", apiLimiter, require("./routes_extra/shipping"));

// Support system routes
app.use("/api/support", apiLimiter, require("./routes_extra/support"));

// Marketing routes
app.use("/api/marketing", strictLimiter, require("./routes_extra/marketing"));

// Test data routes (development only)
if (NODE_ENV === 'development') {
  app.use("/api/test-data", require("./routes/test-data"));
}

// ✅ API Documentation route (development only)
if (NODE_ENV === 'development') {
  app.get("/api/docs", (req, res) => {
    const routes = [];
    
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods),
        });
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            routes.push({
              path: handler.route.path,
              methods: Object.keys(handler.route.methods),
            });
          }
        });
      }
    });
    
    res.json({
      message: "API Documentation",
      environment: NODE_ENV,
      totalRoutes: routes.length,
      routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
    });
  });
}

// ✅ Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    console.log('Request has timed out.');
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// ✅ Error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // CORS error
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }
  
  // JSON parsing error
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON format' });
  }
  
  // Default error response
  const statusCode = error.statusCode || error.status || 500;
  const message = NODE_ENV === 'production' ? 'Internal server error' : error.message;
  
  res.status(statusCode).json({
    error: message,
    timestamp: new Date().toISOString(),
    ...(NODE_ENV === 'development' && { stack: error.stack }),
  });
});

// ✅ 404 handler for unmatched routes
app.use("*", (req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
});

// ✅ Graceful shutdown handling - FIXED
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
});

module.exports = { app, server, socketServer };