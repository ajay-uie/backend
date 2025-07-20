const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, admin } = require('../auth/firebaseConfig');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

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

// Helper: Create sample categories if none exist
const ensureSampleCategories = async () => {
  try {
    const snapshot = await db.collection('categories').limit(1).get();
    
    if (snapshot.empty) {
      console.log('📂 No categories found, creating sample categories...');
      
      const sampleCategories = [
        {
          name: 'Perfumes',
          slug: 'perfumes',
          description: 'Premium fragrances and perfumes',
          isActive: true,
          sortOrder: 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          name: 'Body Sprays',
          slug: 'body-sprays',
          description: 'Fresh and long-lasting body sprays',
          isActive: true,
          sortOrder: 2,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          name: 'Deodorants',
          slug: 'deodorants',
          description: 'All-day protection deodorants',
          isActive: true,
          sortOrder: 3,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          name: 'Gift Sets',
          slug: 'gift-sets',
          description: 'Perfect fragrance gift combinations',
          isActive: true,
          sortOrder: 4,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      ];

      const batch = db.batch();
      sampleCategories.forEach(category => {
        const docRef = db.collection('categories').doc();
        batch.set(docRef, category);
      });
      
      await batch.commit();
      console.log('✅ Sample categories created successfully');
    }
  } catch (error) {
    console.error('❌ Error ensuring sample categories:', error);
  }
};

// Initialize sample categories on module load
ensureSampleCategories();

// GET /admin/categories - Get all categories for admin
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { isActive, sortBy = 'sortOrder', sortOrder = 'asc' } = req.query;

    console.log('📂 Admin fetching categories...');

    let query = db.collection('categories');

    // Apply filters
    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }

    // Apply sorting
    query = query.orderBy(sortBy, sortOrder);

    const snapshot = await query.get();

    const categories = [];
    snapshot.forEach(doc => {
      const categoryData = doc.data();
      categories.push({
        id: doc.id,
        ...categoryData,
        createdAt: categoryData.createdAt?.toDate(),
        updatedAt: categoryData.updatedAt?.toDate()
      });
    });

    console.log(`✅ Admin found ${categories.length} categories`);

    sendResponse(res, 200, true, {
      categories,
      filters: {
        isActive,
        sortBy,
        sortOrder
      }
    }, "Admin categories fetched successfully");

  } catch (error) {
    console.error('❌ Admin get categories error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch admin categories", error.message);
  }
});

// GET /admin/categories/:id - Get single category for admin
router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📂 Admin fetching category with ID: ${id}`);

    const categoryDoc = await db.collection('categories').doc(id).get();

    if (!categoryDoc.exists) {
      console.log(`❌ Category not found: ${id}`);
      return sendResponse(res, 404, false, null, null, "Category not found");
    }

    const categoryData = categoryDoc.data();

    console.log(`✅ Admin category found: ${categoryData.name}`);

    sendResponse(res, 200, true, {
      category: {
        id: categoryDoc.id,
        ...categoryData,
        createdAt: categoryData.createdAt?.toDate(),
        updatedAt: categoryData.updatedAt?.toDate()
      }
    }, "Admin category fetched successfully");

  } catch (error) {
    console.error('❌ Admin get category error:', error);
    sendResponse(res, 500, false, null, null, "Failed to fetch admin category", error.message);
  }
});

// POST /admin/categories - Create new category (Admin only)
router.post('/', authMiddleware, adminMiddleware, [
  body('name').notEmpty().withMessage('Category name is required'),
  body('slug').notEmpty().withMessage('Category slug is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a positive integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const {
      name,
      slug,
      description,
      isActive = true,
      sortOrder = 0
    } = req.body;

    console.log(`📂 Admin creating category: ${name}`);

    // Check if slug already exists
    const existingCategory = await db.collection('categories').where('slug', '==', slug).get();
    if (!existingCategory.empty) {
      return sendResponse(res, 400, false, null, null, "Category slug already exists");
    }

    const categoryData = {
      name,
      slug,
      description: description || "",
      isActive: Boolean(isActive),
      sortOrder: parseInt(sortOrder),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid,
      updatedBy: req.user.uid
    };

    const docRef = await db.collection('categories').add(categoryData);

    console.log(`✅ Admin category created: ${name} (ID: ${docRef.id})`);

    sendResponse(res, 201, true, {
      category: {
        id: docRef.id,
        ...categoryData,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }, "Admin category created successfully");

  } catch (error) {
    console.error('❌ Admin create category error:', error);
    sendResponse(res, 500, false, null, null, "Failed to create admin category", error.message);
  }
});

// PUT /admin/categories/:id - Update category (Admin only)
router.put('/:id', authMiddleware, adminMiddleware, [
  body('name').optional().notEmpty().withMessage('Category name cannot be empty'),
  body('slug').optional().notEmpty().withMessage('Category slug cannot be empty'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a positive integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendResponse(res, 400, false, null, "Validation failed", "Invalid input data", errors.array());
    }

    const { id } = req.params;
    const categoryRef = db.collection('categories').doc(id);
    const categoryDoc = await categoryRef.get();

    if (!categoryDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Category not found");
    }

    console.log(`📂 Admin updating category: ${id}`);

    // Check if slug already exists (if slug is being updated)
    if (req.body.slug) {
      const existingCategory = await db.collection('categories')
        .where('slug', '==', req.body.slug)
        .get();
      
      // Allow if no existing category or if it's the same category being updated
      if (!existingCategory.empty && existingCategory.docs[0].id !== id) {
        return sendResponse(res, 400, false, null, null, "Category slug already exists");
      }
    }

    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    };

    // Convert numeric fields
    if (updateData.sortOrder) updateData.sortOrder = parseInt(updateData.sortOrder);

    await categoryRef.update(updateData);

    const updatedDoc = await categoryRef.get();
    const updatedData = updatedDoc.data();

    console.log(`✅ Admin category updated: ${updatedData.name} (ID: ${id})`);

    sendResponse(res, 200, true, {
      category: {
        id: updatedDoc.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate()
      }
    }, "Admin category updated successfully");

  } catch (error) {
    console.error('❌ Admin update category error:', error);
    sendResponse(res, 500, false, null, null, "Failed to update admin category", error.message);
  }
});

// DELETE /admin/categories/:id - Delete category (Admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const categoryRef = db.collection('categories').doc(id);
    const categoryDoc = await categoryRef.get();

    if (!categoryDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Category not found");
    }

    const categoryData = categoryDoc.data();
    console.log(`📂 Admin deleting category: ${categoryData.name} (ID: ${id})`);

    // Check if category is being used by products
    const productsUsingCategory = await db.collection('products')
      .where('category', '==', categoryData.name)
      .limit(1)
      .get();

    if (!productsUsingCategory.empty) {
      return sendResponse(res, 400, false, null, null, "Cannot delete category that is being used by products");
    }

    await categoryRef.delete();

    console.log(`✅ Admin category deleted: ${categoryData.name} (ID: ${id})`);

    sendResponse(res, 200, true, {
      deletedCategory: {
        id,
        name: categoryData.name
      }
    }, "Admin category deleted successfully");

  } catch (error) {
    console.error('❌ Admin delete category error:', error);
    sendResponse(res, 500, false, null, null, "Failed to delete admin category", error.message);
  }
});

// POST /admin/categories/:id/toggle-active - Toggle category active status
router.post('/:id/toggle-active', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const categoryRef = db.collection('categories').doc(id);
    const categoryDoc = await categoryRef.get();

    if (!categoryDoc.exists) {
      return sendResponse(res, 404, false, null, null, "Category not found");
    }

    const categoryData = categoryDoc.data();
    const newActiveStatus = !categoryData.isActive;

    console.log(`📂 Admin toggling category active status: ${categoryData.name} (${categoryData.isActive} → ${newActiveStatus})`);

    await categoryRef.update({
      isActive: newActiveStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    });

    console.log(`✅ Admin category active status toggled: ${categoryData.name} (ID: ${id})`);

    sendResponse(res, 200, true, {
      category: {
        id,
        name: categoryData.name,
        isActive: newActiveStatus
      }
    }, `Category ${newActiveStatus ? 'activated' : 'deactivated'} successfully`);

  } catch (error) {
    console.error('❌ Admin toggle category active error:', error);
    sendResponse(res, 500, false, null, null, "Failed to toggle category active status", error.message);
  }
});

module.exports = router;

