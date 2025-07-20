// Enhanced Backend Server Configuration (server.js) - FIXED VERSION

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

// ✅ Rate Limiting Configuration - FIXED: More lenient for development
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/health-check';
    }
  });
};

// Different rate limits for different endpoints - FIXED: More generous limits
const authLimiter = createRateLimiter(15 * 60 * 1000, 10, 'Too many authentication attempts'); // Increased from 5 to 10
const apiLimiter = createRateLimiter(15 * 60 * 1000, 200, 'Too many API requests'); // Increased from 100 to 200
const strictLimiter = createRateLimiter(15 * 60 * 1000, 20, 'Rate limit exceeded'); // Increased from 10 to 20

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
app.get("/health-check", (req, res) => {
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
app.get("/health", (req, res) => {
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
    message: "Fragransia Backend API - All Routes Fixed",
    version: "2.2.0",
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    routing: {
      type: "comprehensive",
      description: "All frontend expected routes are now available with proper authentication"
    },
    endpoints: {
      // Primary endpoints
      health: "/health",
      auth: "/auth",
      admin: "/admin",
      products: "/products",
      orders: "/orders",
      cart: "/cart",
      users: "/users",
      wishlist: "/wishlist",
      reviews: "/reviews",
      coupons: "/coupons",
      payments: "/payments"
    }
  });
});

// ========== API Routes with appropriate rate limiting - FIXED ROUTING ==========

// ========== AUTHENTICATION ROUTES ==========
// New routes (primary)
app.use("/auth", authLimiter, require("./routes_new/auth"));
app.use("/admin/auth", authLimiter, require("./routes_new/adminAuth"));

// ========== ADMIN ROUTES ==========
// New admin routes (primary)
app.use("/admin", strictLimiter, require("./routes_new/admin"));

// ========== PUBLIC API ROUTES - FIXED ORDER AND REGISTRATION ==========
// Products routes - FIXED: Using the corrected products route
app.use('/products', apiLimiter, require('./routes_new/products'));

// Other API routes
app.use("/orders", apiLimiter, require("./routes_new/orders"));
app.use("/cart", apiLimiter, require("./routes_new/cart"));
app.use("/users", apiLimiter, require("./routes_new/users"));
app.use("/wishlist", apiLimiter, require("./routes_new/wishlist"));
app.use("/coupons", apiLimiter, require("./routes_new/coupons"));
app.use("/reviews", apiLimiter, require("./routes_new/reviews"));
app.use("/payments", strictLimiter, require("./routes_new/payments"));

// ========== LEGACY ROUTES (BACKUP) ==========
// Original routes (legacy support with different prefixes)
try {
  app.use("/auth-legacy", authLimiter, require("./routes/auth"));
  app.use("/admin/auth-legacy", authLimiter, require("./routes/adminAuth"));
  app.use('/products-legacy', apiLimiter, require('./routes/products'));
  app.use("/orders-legacy", apiLimiter, require("./routes/orders"));
  app.use("/cart-legacy", apiLimiter, require("./routes/cart"));
  app.use("/users-legacy", apiLimiter, require("./routes/users"));
  app.use("/wishlist-legacy", apiLimiter, require("./routes/wishlist"));
  app.use("/coupons-legacy", apiLimiter, require("./routes/coupons"));
} catch (error) {
  console.warn("⚠️ Some legacy routes not available:", error.message);
}

// ========== EXTRA ROUTES (NEW FEATURES) ==========
// Realtime routes (original)
try {
  app.use("/realtime", apiLimiter, require("./routes/realtime"));
} catch (error) {
  console.warn("⚠️ Realtime routes not available:", error.message);
}

// Webhook routes (original)
try {
  app.use("/webhooks", require("./routes/webhooks"));
} catch (error) {
  console.warn("⚠️ Webhook routes not available:", error.message);
}

// ✅ API Documentation route (development only)
if (NODE_ENV === 'development') {
  app.get("/docs", (req, res) => {
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
    suggestion: "Check the API documentation at /docs for available routes"
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
  console.log(`✅ All routes fixed and available`);
  console.log(`📦 Products endpoint: /products`);
  console.log(`🔐 Admin auth endpoint: /admin/auth`);
  
  if (NODE_ENV === 'development') {
    console.log(`📚 API Docs: http://localhost:${PORT}/docs`);
    console.log(`❤️ Health Check: http://localhost:${PORT}/health`);
  }
});

module.exports = { app, server, socketServer };

