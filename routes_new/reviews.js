const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../auth/firebaseConfig');
const verifyAuth = require('../middleware/authMiddleware');

const router = express.Router();

// Helper: Standard Response
const sendResponse = (res, statusCode, success, data = null, message = null, error = null, details = null) => {
  const response = { success };
  if (message) response.message = message;
  if (data) response.data = data;
  if (error) response.error = error;
  if (details) response.details = details;
  
  res.status(statusCode).json(response);
};

// GET /api/reviews/product/:productId - Get reviews for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Verify product exists
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    let query = db.collection('reviews').where('productId', '==', productId);
    query = query.orderBy(sortBy, sortOrder);

    const snapshot = await query.get();
    const reviews = [];

    snapshot.forEach(doc => {
      const reviewData = doc.data();
      reviews.push({
        id: doc.id,
        ...reviewData,
        createdAt: reviewData.createdAt?.toDate(),
        updatedAt: reviewData.updatedAt?.toDate()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedReviews = reviews.slice(startIndex, endIndex);

    const totalReviews = reviews.length;
    const totalPages = Math.ceil(totalReviews / parseInt(limit));

    // Calculate average rating
    const averageRating = reviews.length > 0 ? 
      reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;

    // Calculate rating distribution
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(review => {
      ratingDistribution[review.rating]++;
    });

    sendResponse(res, 200, true, {
      reviews: paginatedReviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalReviews,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      },
      averageRating: Math.round(averageRating * 10) / 10,
      ratingDistribution
    }, "Product reviews fetched successfully");

  } catch (error) {
    console.error('❌ Get product reviews error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch product reviews", error.message);
  }
});

// POST /api/reviews - Create a new review
router.post('/', verifyAuth, [
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('title').notEmpty().withMessage('Review title is required'),
  body('comment').notEmpty().withMessage('Review comment is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { productId, rating, title, comment } = req.body;
    const userId = req.user.uid;

    // Verify product exists
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Product not found");
    }

    // Check if user already reviewed this product
    const existingReview = await db.collection('reviews')
      .where('productId', '==', productId)
      .where('userId', '==', userId)
      .get();

    if (!existingReview.empty) {
      return sendResponse(res, 400, false, null, null, "You have already reviewed this product");
    }

    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    const reviewData = {
      productId,
      userId,
      userName: `${userData.firstName} ${userData.lastName}`,
      rating: parseInt(rating),
      title,
      comment,
      isVerified: false, // Can be set to true if user purchased the product
      helpfulCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const reviewRef = await db.collection('reviews').add(reviewData);

    sendResponse(res, 201, true, {
      review: {
        id: reviewRef.id,
        ...reviewData,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }, "Review created successfully");

  } catch (error) {
    console.error('❌ Create review error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create review", error.message);
  }
});

// PUT /api/reviews/:id - Update a review
router.put('/:id', verifyAuth, [
  body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('title').optional().notEmpty().withMessage('Review title cannot be empty'),
  body('comment').optional().notEmpty().withMessage('Review comment cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { id } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user.uid;

    const reviewRef = db.collection('reviews').doc(id);
    const reviewDoc = await reviewRef.get();

    if (!reviewDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Review not found");
    }

    const reviewData = reviewDoc.data();

    // Check if user owns this review
    if (reviewData.userId !== userId) {
      return sendResponse(res, 403, false, null, null, "You can only update your own reviews");
    }

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (rating !== undefined) updateData.rating = parseInt(rating);
    if (title !== undefined) updateData.title = title;
    if (comment !== undefined) updateData.comment = comment;

    await reviewRef.update(updateData);

    const updatedDoc = await reviewRef.get();
    const updatedData = updatedDoc.data();

    sendResponse(res, 200, true, {
      review: {
        id: updatedDoc.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate()
      }
    }, "Review updated successfully");

  } catch (error) {
    console.error('❌ Update review error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update review", error.message);
  }
});

// DELETE /api/reviews/:id - Delete a review
router.delete('/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.uid;

    const reviewRef = db.collection('reviews').doc(id);
    const reviewDoc = await reviewRef.get();

    if (!reviewDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Review not found");
    }

    const reviewData = reviewDoc.data();

    // Check if user owns this review or is admin
    if (reviewData.userId !== userId && req.user.role !== 'admin') {
      return sendResponse(res, 403, false, null, null, "You can only delete your own reviews");
    }

    await reviewRef.delete();

    sendResponse(res, 200, true, null, "Review deleted successfully");

  } catch (error) {
    console.error('❌ Delete review error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete review", error.message);
  }
});

// GET /api/reviews/user - Get user's reviews
router.get('/user', verifyAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user.uid;

    const snapshot = await db.collection('reviews')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const reviews = [];
    snapshot.forEach(doc => {
      const reviewData = doc.data();
      reviews.push({
        id: doc.id,
        ...reviewData,
        createdAt: reviewData.createdAt?.toDate(),
        updatedAt: reviewData.updatedAt?.toDate()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedReviews = reviews.slice(startIndex, endIndex);

    const totalReviews = reviews.length;
    const totalPages = Math.ceil(totalReviews / parseInt(limit));

    sendResponse(res, 200, true, {
      reviews: paginatedReviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalReviews,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    }, "User reviews fetched successfully");

  } catch (error) {
    console.error('❌ Get user reviews error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch user reviews", error.message);
  }
});

module.exports = router;

