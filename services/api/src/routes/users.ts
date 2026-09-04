import { Router } from 'express';
import { UserController } from '../controllers/user';
import { validate, validators } from '../middleware/validation';
import { asyncHandler } from '../middleware/error';
import multer from 'multer';
import { config } from '../config';

const router = Router();
const userController = new UserController();

// Configure multer for avatar uploads
const upload = multer({
  dest: config.UPLOAD_DIR,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for avatars
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

// Get user profile
router.get('/profile',
  asyncHandler(userController.getProfile.bind(userController))
);

// Update user profile
router.patch('/profile',
  asyncHandler(userController.updateProfile.bind(userController))
);

// Upload avatar
router.post('/avatar',
  upload.single('avatar'),
  asyncHandler(userController.uploadAvatar.bind(userController))
);

// Delete user account
router.delete('/profile',
  asyncHandler(userController.deleteAccount.bind(userController))
);

// Get user statistics
router.get('/stats',
  asyncHandler(userController.getStats.bind(userController))
);

export default router;
