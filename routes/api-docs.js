const express = require("express");
const router = express.Router();

// ✅ Unified API Documentation Route
router.get("/", (req, res) => {
  const apiDocumentation = {
    title: "Fragransia Backend API Documentation",
    version: "1.0.0",
    description: "Complete API documentation for Fragransia e-commerce platform",
    baseUrl: process.env.NODE_ENV === 'production' 
      ? 'https://backend-8npy.onrender.com/api' 
      : `http://localhost:${process.env.PORT || 10000}/api`,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    
    endpoints: {
      // Health & System
      health: {
        path: "/api/health-check",
        method: "GET",
        description: "Health check endpoint",
        auth: false,
        response: {
          status: "OK",
          timestamp: "ISO string",
          environment: "string",
          firebase: "boolean",
          socketConnections: "number",
          uptime: "number"
        }
      },

      // Authentication Routes
      auth: {
        register: {
          path: "/api/auth/register",
          method: "POST",
          description: "Register new user with email/password",
          auth: false,
          body: {
            email: "string (required)",
            password: "string (min 6 chars, required)",
            firstName: "string (required)",
            lastName: "string (required)",
            phoneNumber: "string (optional)"
          },
          response: {
            success: "boolean",
            message: "string",
            data: {
              user: "User object",
              token: "JWT string"
            }
          }
        },
        
        registerToken: {
          path: "/api/auth/register-token",
          method: "POST",
          description: "Register new user with Firebase ID token",
          auth: false,
          body: {
            idToken: "string (required)",
            firstName: "string (required)",
            lastName: "string (required)",
            phoneNumber: "string (optional)"
          },
          response: {
            success: "boolean",
            message: "string",
            data: {
              user: "User object",
              token: "JWT string"
            }
          }
        },

        login: {
          path: "/api/auth/login",
          method: "POST",
          description: "Login with email/password",
          auth: false,
          body: {
            email: "string (required)",
            password: "string (required)"
          },
          response: {
            success: "boolean",
            message: "string",
            data: {
              user: "User object",
              token: "JWT string"
            }
          }
        },

        loginToken: {
          path: "/api/auth/login-token",
          method: "POST",
          description: "Login with Firebase ID token",
          auth: false,
          body: {
            idToken: "string (required)"
          },
          response: {
            success: "boolean",
            message: "string",
            data: {
              user: "User object",
              token: "JWT string"
            }
          }
        },

        googleLogin: {
          path: "/api/auth/google-login",
          method: "POST",
          description: "Google OAuth login (alias for login-token)",
          auth: false,
          body: {
            idToken: "string (required)"
          },
          response: {
            success: "boolean",
            message: "string",
            data: {
              user: "User object",
              token: "JWT string"
            }
          }
        },

        verify: {
          path: "/api/auth/verify",
          method: "POST",
          description: "Verify JWT token",
          auth: true,
          headers: {
            Authorization: "Bearer <token>"
          },
          response: {
            success: "boolean",
            user: "User object"
          }
        },

        forgotPassword: {
          path: "/api/auth/forgot-password",
          method: "POST",
          description: "Send password reset email",
          auth: false,
          body: {
            email: "string (required)"
          },
          response: {
            success: "boolean",
            message: "string"
          }
        },

        logout: {
          path: "/api/auth/logout",
          method: "POST",
          description: "Logout (stateless - client should delete token)",
          auth: false,
          response: {
            success: "boolean",
            message: "string"
          }
        }
      },

      // Enhanced Authentication Routes
      authEnhanced: {
        basePath: "/api/auth-enhanced",
        description: "Enhanced authentication with additional features",
        endpoints: "See /api/auth-enhanced for detailed documentation"
      },

      // Admin Authentication
      adminAuth: {
        basePath: "/api/admin/auth",
        description: "Admin-specific authentication endpoints",
        endpoints: "See /api/admin/auth for detailed documentation"
      },

      // Admin Routes
      admin: {
        basePath: "/api/admin",
        description: "Admin panel endpoints",
        auth: true,
        role: "admin",
        endpoints: "See /api/admin for detailed documentation"
      },

      // Product Routes
      products: {
        basePath: "/api/products",
        description: "Product management endpoints",
        endpoints: {
          list: {
            path: "/api/products",
            method: "GET",
            description: "Get products with optional filtering",
            auth: false,
            query: {
              category: "string (optional)",
              search: "string (optional)",
              page: "number (optional, default: 1)",
              limit: "number (optional, default: 20)"
            },
            response: {
              success: "boolean",
              data: {
                products: "Product[]",
                total: "number",
                page: "number",
                totalPages: "number"
              }
            }
          },
          get: {
            path: "/api/products/:id",
            method: "GET",
            description: "Get single product by ID",
            auth: false,
            response: {
              success: "boolean",
              data: "Product object"
            }
          },
          create: {
            path: "/api/products",
            method: "POST",
            description: "Create new product",
            auth: true,
            role: "admin",
            body: "Product data object",
            response: {
              success: "boolean",
              data: "Product object"
            }
          }
        }
      },

      // Order Routes
      orders: {
        basePath: "/api/orders",
        description: "Order management endpoints",
        auth: true,
        endpoints: {
          create: {
            path: "/api/orders/create",
            method: "POST",
            description: "Create new order",
            body: {
              items: "Array of order items",
              shippingAddress: "Address object",
              shippingOption: "Shipping option object",
              coupon: "Coupon object (optional)",
              paymentData: "Payment data object",
              total: "number"
            },
            response: {
              success: "boolean",
              data: "Order object"
            }
          },
          get: {
            path: "/api/orders/:id",
            method: "GET",
            description: "Get single order by ID",
            response: {
              success: "boolean",
              data: "Order object"
            }
          },
          userOrders: {
            path: "/api/orders/user",
            method: "GET",
            description: "Get current user's orders",
            response: {
              success: "boolean",
              data: "Order[] array"
            }
          }
        }
      },

      // Cart Routes
      cart: {
        basePath: "/api/cart",
        description: "Shopping cart endpoints",
        auth: true,
        endpoints: "See /api/cart for detailed documentation"
      },

      // User Routes
      users: {
        basePath: "/api/users",
        description: "User management endpoints",
        auth: true,
        endpoints: {
          profile: {
            path: "/api/users/profile",
            method: "GET",
            description: "Get current user profile",
            response: {
              success: "boolean",
              data: "User object"
            }
          },
          updateProfile: {
            path: "/api/users/profile",
            method: "PUT",
            description: "Update user profile",
            body: "Partial User object",
            response: {
              success: "boolean",
              data: "Updated User object"
            }
          },
          addresses: {
            path: "/api/users/addresses",
            method: "GET",
            description: "Get user addresses",
            response: {
              success: "boolean",
              data: "Address[] array"
            }
          }
        }
      },

      // Wishlist Routes
      wishlist: {
        basePath: "/api/wishlist",
        description: "User wishlist endpoints",
        auth: true,
        endpoints: "See /api/wishlist for detailed documentation"
      },

      // Review Routes
      reviews: {
        basePath: "/api/reviews",
        description: "Product review endpoints",
        endpoints: "See /api/reviews for detailed documentation"
      },

      // Coupon Routes
      coupons: {
        basePath: "/api/coupons",
        description: "Coupon and discount endpoints",
        endpoints: {
          apply: {
            path: "/api/coupons/apply",
            method: "POST",
            description: "Apply coupon code",
            auth: true,
            body: {
              code: "string (required)"
            },
            response: {
              success: "boolean",
              data: {
                discount: "number",
                type: "string"
              }
            }
          },
          public: {
            path: "/api/coupons/public",
            method: "GET",
            description: "Get public coupons",
            auth: false,
            response: {
              success: "boolean",
              data: "Coupon[] array"
            }
          }
        }
      },

      // Payment Routes
      payments: {
        basePath: "/api/payments",
        description: "Payment processing endpoints",
        endpoints: {
          verify: {
            path: "/api/payments/verify",
            method: "POST",
            description: "Verify payment",
            auth: true,
            body: {
              razorpay_payment_id: "string (optional)",
              razorpay_order_id: "string (optional)",
              razorpay_signature: "string (optional)",
              payment_id: "string (optional)",
              method: "string (required)"
            },
            response: {
              success: "boolean",
              data: {
                verified: "boolean"
              }
            }
          }
        }
      },

      // Payment API Routes
      paymentsApi: {
        basePath: "/api/payments-api",
        description: "Advanced payment API endpoints",
        endpoints: "See /api/payments-api for detailed documentation"
      },

      // Realtime Routes
      realtime: {
        basePath: "/api/realtime",
        description: "Real-time data endpoints",
        endpoints: "See /api/realtime for detailed documentation"
      },

      // Webhook Routes
      webhooks: {
        basePath: "/api/webhooks",
        description: "External webhook endpoints",
        auth: false,
        endpoints: "See /api/webhooks for detailed documentation"
      },

      // Test Data Routes (Development Only)
      testData: {
        basePath: "/api/test-data",
        description: "Test data generation endpoints (development only)",
        available: process.env.NODE_ENV === 'development',
        endpoints: process.env.NODE_ENV === 'development' 
          ? "See /api/test-data for detailed documentation"
          : "Not available in production"
      }
    },

    // Data Models
    models: {
      User: {
        uid: "string (unique identifier)",
        email: "string",
        firstName: "string",
        lastName: "string",
        phoneNumber: "string (optional)",
        role: "string (customer|admin)",
        isActive: "boolean",
        emailVerified: "boolean",
        createdAt: "Date",
        updatedAt: "Date",
        lastLogin: "Date (optional)",
        preferences: "object",
        addresses: "Address[]",
        orderHistory: "string[] (order IDs)"
      },

      Product: {
        id: "string",
        name: "string",
        price: "number",
        originalPrice: "number (optional)",
        category: "string",
        rating: "number (optional)",
        reviews: "number (optional)",
        size: "string (optional)",
        image: "string (URL)",
        description: "string",
        notes: {
          top: "string[]",
          middle: "string[]",
          base: "string[]"
        },
        discount: "number (optional)",
        stock: "number",
        status: "string (active|inactive)",
        createdAt: "string (ISO date)",
        updatedAt: "string (ISO date)"
      },

      Order: {
        id: "string",
        userId: "string",
        items: "OrderItem[]",
        total: "number",
        status: "string (pending|confirmed|shipped|delivered|cancelled)",
        shippingAddress: "Address",
        paymentMethod: "string",
        createdAt: "string (ISO date)",
        updatedAt: "string (ISO date)"
      },

      Address: {
        id: "string",
        name: "string",
        phone: "string",
        address: "string",
        city: "string",
        state: "string",
        pincode: "string",
        isDefault: "boolean",
        country: "string (optional)",
        type: "string (home|office|other, optional)"
      }
    },

    // Authentication
    authentication: {
      type: "JWT Bearer Token",
      header: "Authorization: Bearer <token>",
      expiry: "7 days",
      note: "Include the Authorization header for protected endpoints"
    },

    // Rate Limiting
    rateLimiting: {
      auth: "5 requests per 15 minutes",
      api: "100 requests per 15 minutes",
      strict: "10 requests per 15 minutes",
      note: "Different endpoints have different rate limits"
    },

    // Error Responses
    errorResponses: {
      400: "Bad Request - Invalid input data",
      401: "Unauthorized - Missing or invalid token",
      403: "Forbidden - Insufficient permissions",
      404: "Not Found - Resource not found",
      409: "Conflict - Resource already exists",
      429: "Too Many Requests - Rate limit exceeded",
      500: "Internal Server Error - Server error"
    },

    // Socket.IO
    socketIO: {
      enabled: true,
      events: "Real-time updates for orders, inventory, etc.",
      connection: "Automatic connection on server start"
    }
  };

  res.json(apiDocumentation);
});

// ✅ Route-specific documentation endpoints
router.get("/auth", (req, res) => {
  res.json({
    title: "Authentication API",
    description: "All authentication-related endpoints",
    baseUrl: "/api/auth",
    endpoints: [
      "POST /register - Register new user",
      "POST /register-token - Register with Firebase token",
      "POST /login - Login with email/password",
      "POST /login-token - Login with Firebase token",
      "POST /google-login - Google OAuth login",
      "POST /verify - Verify JWT token",
      "POST /forgot-password - Send password reset",
      "POST /logout - Logout user"
    ]
  });
});

router.get("/products", (req, res) => {
  res.json({
    title: "Products API",
    description: "Product management endpoints",
    baseUrl: "/api/products",
    endpoints: [
      "GET / - List products with filtering",
      "GET /:id - Get single product",
      "POST / - Create product (admin only)",
      "PUT /:id - Update product (admin only)",
      "DELETE /:id - Delete product (admin only)"
    ]
  });
});

router.get("/orders", (req, res) => {
  res.json({
    title: "Orders API",
    description: "Order management endpoints",
    baseUrl: "/api/orders",
    endpoints: [
      "POST /create - Create new order",
      "GET /:id - Get single order",
      "GET /user - Get user's orders",
      "PUT /:id/status - Update order status (admin only)"
    ]
  });
});

module.exports = router;

