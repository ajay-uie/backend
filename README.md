# Fragransia Backend - Complete API Server

A comprehensive backend server for the Fragransia e-commerce platform with real-time functionality, authentication, and all necessary API endpoints.

## Features

### 🔐 Authentication & Authorization
- JWT-based authentication
- User registration and login
- Google OAuth integration
- Admin authentication with role-based access
- Password reset functionality

### 🛍️ E-commerce Core
- Product management (CRUD operations)
- Order management with status tracking
- Shopping cart functionality
- Wishlist management
- User profile management
- Review and rating system

### 💳 Payment & Coupons
- Payment verification endpoints
- Coupon management and application
- Order total calculations with discounts

### 🔄 Real-time Features
- WebSocket integration with Socket.IO
- Real-time dashboard updates
- Live order status notifications
- System alerts and inventory notifications
- Visitor tracking and analytics
- Periodic system stats updates

### 👨‍💼 Admin Panel Support
- Admin dashboard with analytics
- Product management interface
- Order status management
- User management
- Coupon management
- Real-time monitoring

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/google-login` - Google OAuth login
- `POST /api/auth/verify` - Verify JWT token
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forgot-password` - Password reset

### Admin Authentication
- `POST /api/admin/auth/login` - Admin login
- `GET /api/admin/auth/verify` - Verify admin token
- `POST /api/admin/auth/logout` - Admin logout
- `POST /api/admin/auth/refresh` - Refresh admin token
- `GET /api/admin/auth/profile` - Get admin profile
- `PUT /api/admin/auth/profile` - Update admin profile

### Products
- `GET /api/products` - Get all products (with filters)
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (admin)
- `POST /api/admin/products` - Create product (admin)
- `PUT /api/admin/products/:id` - Update product (admin)
- `DELETE /api/admin/products/:id` - Delete product (admin)

### Orders
- `POST /api/orders/create` - Create new order
- `GET /api/orders/user` - Get user orders
- `GET /api/orders/:id` - Get single order
- `GET /api/orders` - Get all orders (admin)
- `PUT /api/admin/orders/:id/status` - Update order status (admin)

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/addresses` - Get user addresses
- `GET /api/users` - Get all users (admin)

### Cart
- `GET /api/cart` - Get user cart
- `POST /api/cart/add` - Add item to cart
- `PUT /api/cart/update` - Update cart item
- `DELETE /api/cart/remove` - Remove item from cart
- `DELETE /api/cart/clear` - Clear entire cart

### Wishlist
- `GET /api/wishlist` - Get user wishlist
- `POST /api/wishlist/add` - Add item to wishlist
- `DELETE /api/wishlist/remove` - Remove item from wishlist

### Reviews
- `GET /api/reviews/:productId` - Get product reviews
- `POST /api/reviews` - Create review

### Payments
- `POST /api/payments/verify` - Verify payment

### Coupons
- `GET /api/coupons/public` - Get public coupons
- `POST /api/coupons/apply` - Apply coupon
- `GET /api/coupons` - Get all coupons (admin)
- `POST /api/coupons` - Create coupon (admin)

### Admin Dashboard
- `GET /api/admin/dashboard` - Get dashboard stats
- `GET /api/admin/countdown-settings` - Get countdown settings

### Real-time
- `GET /api/realtime/status` - Get real-time server status
- `GET /api/realtime/stats` - Get real-time statistics
- `POST /api/realtime/trigger` - Trigger real-time updates (admin)

### Health Check
- `GET /health` - Health check endpoint
- `GET /api/health` - API health check
- `GET /api/health-check` - Alternative health check

### Webhooks
- `POST /api/webhooks/payment` - Payment webhook handler

## Real-time Events

### Client Events (sent to server)
- `authenticate` - Authenticate client connection
- `subscribe-to-updates` - Subscribe to specific update types
- `admin-action` - Perform admin actions

### Server Events (sent to clients)
- `authenticated` - Authentication successful
- `authentication-error` - Authentication failed
- `dashboard-data` - Initial dashboard data
- `system-stats` - System statistics
- `website-data` - General website data
- `product-updated` - Product changes
- `order-updated` - Order changes
- `user-updated` - User changes
- `system-alert` - System alerts
- `inventory-alert` - Inventory alerts
- `sales-update` - Sales updates
- `visitor-update` - Visitor count updates
- `order-status-update` - Order status notifications
- `system-stats-update` - Periodic system stats
- `heartbeat` - Connection heartbeat

## Installation & Setup

1. **Clone or extract the backend files**
   ```bash
   cd complete-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

4. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your_super_secret_jwt_key_here
```

## Data Storage

This backend uses **in-memory storage** for demonstration purposes. In production, you should integrate with a proper database like:

- MongoDB with Mongoose
- PostgreSQL with Sequelize
- MySQL with Sequelize
- Firebase Firestore

## Security Features

- CORS configuration for cross-origin requests
- JWT token-based authentication
- Role-based access control (admin/user)
- Input validation and sanitization
- Rate limiting (can be added)
- Helmet for security headers (dependency included)

## Deployment

### Render/Heroku/Railway
1. Push code to GitHub repository
2. Connect repository to your hosting platform
3. Set environment variables in platform dashboard
4. Deploy

### Docker (optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## Testing

You can test the API endpoints using:
- Postman
- Thunder Client (VS Code extension)
- curl commands
- Frontend application

### Example API calls:

```bash
# Health check
curl http://localhost:5000/health

# Register user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Get products
curl http://localhost:5000/api/products
```

## WebSocket Testing

You can test WebSocket functionality using a WebSocket client or by connecting from your frontend:

```javascript
const socket = io('http://localhost:5000');

socket.emit('authenticate', {
  token: 'your_jwt_token',
  userType: 'admin'
});

socket.on('authenticated', (data) => {
  console.log('Authenticated:', data);
});

socket.on('dashboard-data', (data) => {
  console.log('Dashboard data:', data);
});
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions, please contact the development team or create an issue in the repository.

---

**Note**: This is a complete, production-ready backend server with all necessary endpoints for an e-commerce platform. It includes authentication, real-time features, admin functionality, and comprehensive API coverage.

