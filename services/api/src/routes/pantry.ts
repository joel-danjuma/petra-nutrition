import { Router } from 'express';
import { PantryController } from '../controllers/pantry';
import { requirePremium, userRateLimit } from '../middleware/auth';
import { validate, validators } from '../middleware/validation';
import { asyncHandler } from '../middleware/error';
import multer from 'multer';
import { config } from '../config';

const router = Router();
const pantryController = new PantryController();

// Configure multer for image uploads
const upload = multer({
  dest: config.UPLOAD_DIR,
  limits: {
    fileSize: config.MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.'));
    }
  },
});

// All pantry routes require premium subscription
router.use(requirePremium);

// Get pantry items with search and filtering
router.get('/',
  validate([
    validators.page,
    validators.limit,
    validators.searchQuery,
  ]),
  asyncHandler(pantryController.getItems.bind(pantryController))
);

// Get pantry statistics
router.get('/stats',
  asyncHandler(pantryController.getStats.bind(pantryController))
);

// Get single pantry item
router.get('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(pantryController.getById.bind(pantryController))
);

// Create new pantry item
router.post('/',
  validate([
    validators.itemName,
    validators.quantity,
    validators.category,
    validators.location,
    validators.pastDate('purchaseDate'),
    validators.futureDate('expirationDate'),
  ]),
  asyncHandler(pantryController.create.bind(pantryController))
);

// Update pantry item
router.patch('/:id',
  validate([
    validators.uuid('id'),
    // All fields optional for updates
  ]),
  asyncHandler(pantryController.update.bind(pantryController))
);

// Delete pantry item
router.delete('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(pantryController.delete.bind(pantryController))
);

// Bulk update pantry items
router.patch('/bulk',
  userRateLimit(20, 60000), // 20 requests per minute
  asyncHandler(pantryController.bulkUpdate.bind(pantryController))
);

// Barcode scanning
router.post('/scan/barcode',
  userRateLimit(30, 60000), // 30 scans per minute
  asyncHandler(pantryController.scanBarcode.bind(pantryController))
);

// Image recognition for fresh produce
router.post('/scan/image',
  userRateLimit(10, 60000), // 10 image recognitions per minute
  asyncHandler(pantryController.recognizeImage.bind(pantryController))
);

// Upload and recognize image
router.post('/scan/upload',
  upload.single('image'),
  userRateLimit(10, 60000),
  asyncHandler(pantryController.uploadAndRecognize.bind(pantryController))
);

// Export pantry data
router.get('/export',
  asyncHandler(pantryController.exportData.bind(pantryController))
);

export default router;
