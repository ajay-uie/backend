const express = require('express');
const router = express.Router();

// Real-time data endpoints for frontend
router.get('/dashboard-stats', async (req, res) => {
  try {
    if (global.socketServer) {
      const dashboardData = global.socketServer.getDashboardData();
      const systemStats = global.socketServer.getSystemStats();
      
      res.json({
        success: true,
        data: {
          ...dashboardData,
          systemStats,
          timestamp: new Date()
        }
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Real-time service not available'
      });
    }
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard stats'
    });
  }
});

// Get current website data
router.get('/website-data', async (req, res) => {
  try {
    if (global.socketServer) {
      const websiteData = global.socketServer.getWebsiteData();
      
      res.json({
        success: true,
        data: {
          ...websiteData,
          timestamp: new Date()
        }
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Real-time service not available'
      });
    }
  } catch (error) {
    console.error('Website data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch website data'
    });
  }
});

// Trigger manual updates (for testing)
router.post('/trigger-update', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    if (!global.socketServer) {
      return res.status(503).json({
        success: false,
        error: 'Real-time service not available'
      });
    }

    switch (type) {
      case 'product':
        global.socketServer.triggerProductUpdate(data);
        break;
      case 'order':
        global.socketServer.triggerOrderUpdate(data);
        break;
      case 'user':
        global.socketServer.triggerUserUpdate(data);
        break;
      case 'system-alert':
        global.socketServer.triggerSystemAlert(data);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid update type'
        });
    }

    res.json({
      success: true,
      message: `${type} update triggered successfully`
    });
  } catch (error) {
    console.error('Manual update trigger error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger update'
    });
  }
});

// Get connected clients info
router.get('/clients-info', async (req, res) => {
  try {
    if (global.socketServer) {
      res.json({
        success: true,
        data: {
          totalClients: global.socketServer.getConnectedClientsCount(),
          adminClients: global.socketServer.getAdminClientsCount(),
          timestamp: new Date()
        }
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Real-time service not available'
      });
    }
  } catch (error) {
    console.error('Clients info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clients info'
    });
  }
});

// Health check for real-time service
router.get('/health', (req, res) => {
  const isHealthy = global.socketServer !== undefined;
  
  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    service: 'real-time',
    status: isHealthy ? 'healthy' : 'unavailable',
    timestamp: new Date()
  });
});

module.exports = router;

