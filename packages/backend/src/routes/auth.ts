import { Router } from 'express';
import { AuthController } from '../controllers/auth';
import { validate, validators } from '../middleware/validation';
import { asyncHandler } from '../middleware/error';

const router = Router();
const authController = new AuthController();

// Registration
router.post('/register', 
  validate([
    validators.email,
    validators.password,
    validators.firstName,
    validators.lastName,
  ]),
  asyncHandler(authController.register.bind(authController))
);

// Login
router.post('/login',
  validate([
    validators.email,
    validators.password,
  ]),
  asyncHandler(authController.login.bind(authController))
);

// Refresh token
router.post('/refresh',
  asyncHandler(authController.refreshToken.bind(authController))
);

// Logout
router.post('/logout',
  asyncHandler(authController.logout.bind(authController))
);

// Password reset request
router.post('/password-reset',
  validate([validators.email]),
  asyncHandler(authController.requestPasswordReset.bind(authController))
);

// Password reset confirmation
router.post('/password-reset/confirm',
  validate([
    validators.password,
    // Add token validation
  ]),
  asyncHandler(authController.confirmPasswordReset.bind(authController))
);

// Email verification
router.post('/verify-email/:token',
  asyncHandler(authController.verifyEmail.bind(authController))
);

// Resend verification email
router.post('/resend-verification',
  validate([validators.email]),
  asyncHandler(authController.resendVerification.bind(authController))
);

export default router;
