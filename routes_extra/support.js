// Support Routes - Extra API Endpoints
const express = require('express');
const router = express.Router();

// GET /api/support/tickets - Get support tickets
router.get('/tickets', async (req, res) => {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        tickets: [
          {
            id: 1,
            ticketNumber: "TKT-2025-001",
            subject: "Order not received",
            description: "I placed an order 10 days ago but haven't received it yet",
            status: "open",
            priority: "high",
            category: "order_issue",
            userId: 123,
            userName: "John Doe",
            userEmail: "john@example.com",
            assignedTo: "support_agent_1",
            createdAt: "2025-01-15T10:00:00Z",
            updatedAt: "2025-01-18T14:30:00Z",
            responses: 3
          },
          {
            id: 2,
            ticketNumber: "TKT-2025-002",
            subject: "Product quality issue",
            description: "The fragrance I received doesn't match the description",
            status: "in_progress",
            priority: "medium",
            category: "product_quality",
            userId: 456,
            userName: "Jane Smith",
            userEmail: "jane@example.com",
            assignedTo: "support_agent_2",
            createdAt: "2025-01-16T09:15:00Z",
            updatedAt: "2025-01-17T11:20:00Z",
            responses: 2
          },
          {
            id: 3,
            ticketNumber: "TKT-2025-003",
            subject: "Refund request",
            description: "I would like to return my order and get a refund",
            status: "resolved",
            priority: "low",
            category: "refund",
            userId: 789,
            userName: "Bob Johnson",
            userEmail: "bob@example.com",
            assignedTo: "support_agent_1",
            createdAt: "2025-01-10T16:45:00Z",
            updatedAt: "2025-01-14T10:30:00Z",
            responses: 5
          }
        ],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 45,
          pages: 3
        },
        summary: {
          open: 15,
          inProgress: 12,
          resolved: 18,
          total: 45
        }
      },
      message: "Support tickets retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve support tickets",
      details: error.message
    });
  }
});

// POST /api/support/tickets - Create support ticket
router.post('/tickets', async (req, res) => {
  try {
    const { subject, description, category, priority = 'medium', userId, userEmail } = req.body;
    
    if (!subject || !description || !category) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        details: ["subject", "description", "category are required"]
      });
    }
    
    const ticket = {
      id: Date.now(),
      ticketNumber: `TKT-2025-${String(Date.now()).slice(-3)}`,
      subject,
      description,
      category,
      priority,
      status: "open",
      userId,
      userEmail,
      assignedTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      responses: 0
    };
    
    res.status(201).json({
      success: true,
      data: { ticket },
      message: "Support ticket created successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to create support ticket",
      details: error.message
    });
  }
});

// GET /api/support/tickets/:id - Get specific ticket
router.get('/tickets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    res.status(200).json({
      success: true,
      data: {
        ticket: {
          id: parseInt(id),
          ticketNumber: "TKT-2025-001",
          subject: "Order not received",
          description: "I placed an order 10 days ago but haven't received it yet",
          status: "open",
          priority: "high",
          category: "order_issue",
          userId: 123,
          userName: "John Doe",
          userEmail: "john@example.com",
          assignedTo: "support_agent_1",
          createdAt: "2025-01-15T10:00:00Z",
          updatedAt: "2025-01-18T14:30:00Z"
        },
        responses: [
          {
            id: 1,
            message: "Thank you for contacting us. We're looking into your order.",
            author: "support_agent_1",
            authorName: "Sarah Support",
            isStaff: true,
            createdAt: "2025-01-15T11:00:00Z"
          },
          {
            id: 2,
            message: "I checked the tracking and it shows the package is still in transit.",
            author: "123",
            authorName: "John Doe",
            isStaff: false,
            createdAt: "2025-01-16T09:30:00Z"
          },
          {
            id: 3,
            message: "We've contacted the shipping carrier and they will prioritize your delivery.",
            author: "support_agent_1",
            authorName: "Sarah Support",
            isStaff: true,
            createdAt: "2025-01-18T14:30:00Z"
          }
        ]
      },
      message: "Support ticket retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve support ticket",
      details: error.message
    });
  }
});

// POST /api/support/tickets/:id/responses - Add response to ticket
router.post('/tickets/:id/responses', async (req, res) => {
  try {
    const { id } = req.params;
    const { message, authorId, isStaff = false } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }
    
    const response = {
      id: Date.now(),
      ticketId: parseInt(id),
      message,
      author: authorId,
      authorName: isStaff ? "Support Agent" : "Customer",
      isStaff,
      createdAt: new Date()
    };
    
    res.status(201).json({
      success: true,
      data: { response },
      message: "Response added successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to add response",
      details: error.message
    });
  }
});

// PUT /api/support/tickets/:id/status - Update ticket status
router.put('/tickets/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedTo } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required"
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        ticketId: parseInt(id),
        status,
        assignedTo,
        updatedAt: new Date()
      },
      message: "Ticket status updated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update ticket status",
      details: error.message
    });
  }
});

// GET /api/support/categories - Get support categories
router.get('/categories', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        categories: [
          {
            id: "order_issue",
            name: "Order Issues",
            description: "Problems with orders, delivery, or tracking"
          },
          {
            id: "product_quality",
            name: "Product Quality",
            description: "Issues with product quality or authenticity"
          },
          {
            id: "refund",
            name: "Refunds & Returns",
            description: "Refund requests and return processes"
          },
          {
            id: "account",
            name: "Account Issues",
            description: "Login, password, or account-related problems"
          },
          {
            id: "technical",
            name: "Technical Support",
            description: "Website or app technical issues"
          },
          {
            id: "billing",
            name: "Billing & Payment",
            description: "Payment issues or billing questions"
          },
          {
            id: "general",
            name: "General Inquiry",
            description: "General questions or feedback"
          }
        ]
      },
      message: "Support categories retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve support categories",
      details: error.message
    });
  }
});

// GET /api/support/faq - Get frequently asked questions
router.get('/faq', async (req, res) => {
  try {
    const { category } = req.query;
    
    res.status(200).json({
      success: true,
      data: {
        faqs: [
          {
            id: 1,
            question: "How long does shipping take?",
            answer: "Standard shipping takes 5-7 business days, express shipping takes 2-3 business days.",
            category: "shipping",
            helpful: 45,
            notHelpful: 3
          },
          {
            id: 2,
            question: "What is your return policy?",
            answer: "We accept returns within 30 days of purchase. Items must be unopened and in original condition.",
            category: "returns",
            helpful: 38,
            notHelpful: 2
          },
          {
            id: 3,
            question: "Are your fragrances authentic?",
            answer: "Yes, all our fragrances are 100% authentic and sourced directly from authorized distributors.",
            category: "products",
            helpful: 52,
            notHelpful: 1
          },
          {
            id: 4,
            question: "How can I track my order?",
            answer: "You can track your order using the tracking number sent to your email or in your account dashboard.",
            category: "orders",
            helpful: 41,
            notHelpful: 4
          }
        ],
        categories: ["shipping", "returns", "products", "orders", "payments", "account"]
      },
      message: "FAQ retrieved successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve FAQ",
      details: error.message
    });
  }
});

module.exports = router;

