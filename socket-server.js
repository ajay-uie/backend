const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { db } = require('./auth/firebaseConfig');

class SocketServer {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.connectedClients = new Map();
    this.adminClients = new Set();

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('authenticate', (data) => {
        try {
          const { token, userType } = data;
          if (token) {
            this.connectedClients.set(socket.id, {
              socket,
              userType,
              authenticated: true,
              connectedAt: new Date()
            });

            if (userType === 'admin') {
              this.adminClients.add(socket.id);
              socket.join('admin-room');
              console.log('Admin authenticated:', socket.id);
            } else {
              socket.join('user-room');
              console.log('User authenticated:', socket.id);
            }

            socket.emit('authenticated', { success: true });
            this.sendInitialData(socket, userType);
          }
        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('authentication-error', { error: 'Invalid token' });
        }
      });

      socket.on('subscribe-to-updates', (data) => {
        const { types } = data;
        const client = this.connectedClients.get(socket.id);

        if (client && client.authenticated) {
          client.subscriptions = types;
          console.log(`Client ${socket.id} subscribed to:`, types);
        }
      });

      socket.on('admin-action', (data) => {
        const client = this.connectedClients.get(socket.id);

        if (client && client.userType === 'admin') {
          this.handleAdminAction(socket, data);
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.connectedClients.delete(socket.id);
        this.adminClients.delete(socket.id);
      });
    });
  }

  sendInitialData(socket, userType) {
    if (userType === 'admin') {
      socket.emit('dashboard-data', this.getDashboardData());
      socket.emit('system-stats', this.getSystemStats());
    }
    socket.emit('website-data', this.getWebsiteData());
  }

  handleAdminAction(socket, data) {
    const { action, payload } = data;
    switch (action) {
      case 'update-product':
        this.broadcastProductUpdate(payload);
        break;
      case 'update-order':
        this.broadcastOrderUpdate(payload);
        break;
      case 'update-user':
        this.broadcastUserUpdate(payload);
        break;
      case 'system-alert':
        this.broadcastSystemAlert(payload);
        break;
      default:
        console.log('Unknown admin action:', action);
    }
  }

  broadcastProductUpdate(product) {
    this.io.to('admin-room').emit('product-updated', {
      type: 'product-update',
      data: product,
      timestamp: new Date()
    });
    if (product.active) {
      this.io.to('user-room').emit('product-available', {
        type: 'product-available',
        data: product,
        timestamp: new Date()
      });
    }
  }

  broadcastOrderUpdate(order) {
    this.io.to('admin-room').emit('order-updated', {
      type: 'order-update',
      data: order,
      timestamp: new Date()
    });
    this.notifyUserOrderUpdate(order);
  }

  broadcastUserUpdate(user) {
    this.io.to('admin-room').emit('user-updated', {
      type: 'user-update',
      data: user,
      timestamp: new Date()
    });
  }

  broadcastSystemAlert(alert) {
    this.io.to('admin-room').emit('system-alert', {
      type: 'system-alert',
      data: alert,
      timestamp: new Date()
    });
  }

  broadcastInventoryAlert(product) {
    this.io.to('admin-room').emit('inventory-alert', {
      type: 'inventory-alert',
      data: {
        productId: product.id,
        productName: product.name,
        currentStock: product.stock,
        status: product.stock === 0 ? 'out-of-stock' : 'low-stock'
      },
      timestamp: new Date()
    });
  }

  broadcastSalesUpdate(salesData) {
    this.io.to('admin-room').emit('sales-update', {
      type: 'sales-update',
      data: salesData,
      timestamp: new Date()
    });
  }

  broadcastVisitorUpdate(visitorData) {
    this.io.to('admin-room').emit('visitor-update', {
      type: 'visitor-update',
      data: visitorData,
      timestamp: new Date()
    });
  }

  notifyUserOrderUpdate(order) {
    this.io.emit('order-status-update', {
      type: 'order-status-update',
      data: {
        orderId: order.id,
        status: order.status,
        message: this.getOrderStatusMessage(order.status)
      },
      timestamp: new Date()
    });
  }

  getOrderStatusMessage(status) {
    const messages = {
      'pending': 'Your order is being processed',
      'confirmed': 'Your order has been confirmed',
      'processing': 'Your order is being prepared',
      'shipped': 'Your order has been shipped',
      'delivered': 'Your order has been delivered',
      'cancelled': 'Your order has been cancelled'
    };
    return messages[status] || 'Order status updated';
  }

  getDashboardData() {
    return {
      totalRevenue: 0,
      totalOrders: 0,
      totalCustomers: 0,
      totalProducts: 0,
      recentOrders: [],
      lowStockProducts: []
    };
  }

  getSystemStats() {
    return {
      serverUptime: 100,
      responseTime: 200,
      errorRate: 0,
      activeUsers: this.connectedClients.size,
      memoryUsage: 45,
      cpuUsage: 15
    };
  }

  getWebsiteData() {
    return {
      featuredProducts: [],
      announcements: [
        { id: '1', message: 'Welcome to Fragransia', type: 'info' }
      ],
      onlineVisitors: Math.floor(Math.random() * 50) + 10
    };
  }

  triggerProductUpdate(product) {
    this.broadcastProductUpdate(product);
    if (product.stock <= 10) {
      this.broadcastInventoryAlert(product);
    }
  }

  triggerOrderUpdate(order) {
    this.broadcastOrderUpdate(order);
    this.broadcastSalesUpdate({
      newOrder: order,
      totalRevenue: this.calculateTotalRevenue(),
      totalOrders: this.getTotalOrders()
    });
  }

  triggerUserUpdate(user) {
    this.broadcastUserUpdate(user);
  }

  triggerSystemAlert(alert) {
    this.broadcastSystemAlert(alert);
  }

  startPeriodicUpdates() {
    setInterval(() => {
      this.io.to('admin-room').emit('system-stats-update', {
        type: 'system-stats-update',
        data: this.getSystemStats(),
        timestamp: new Date()
      });
    }, 30000);

    setInterval(() => {
      this.broadcastVisitorUpdate({
        onlineVisitors: Math.floor(Math.random() * 50) + 10,
        pageViews: Math.floor(Math.random() * 100) + 50
      });
    }, 10000);

    setInterval(() => {
      this.io.emit('heartbeat', {
        timestamp: new Date(),
        connectedClients: this.connectedClients.size
      });
    }, 5000);
  }

  calculateTotalRevenue() {
    return 0;
  }

  getTotalOrders() {
    return 0;
  }

  getConnectedClientsCount() {
    return this.connectedClients.size;
  }

  getAdminClientsCount() {
    return this.adminClients.size;
  }
}

module.exports = SocketServer;
