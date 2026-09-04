import { AuthService } from '../../../src/services/auth';
import { prismaMock } from '../../setup';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Mock bcrypt
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// Mock jwt
jest.mock('jsonwebtoken');
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a new user with hashed password', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const hashedPassword = 'hashedPassword123';
      const createdUser = {
        id: 'user-id',
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        passwordHash: hashedPassword,
        isPremium: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockedBcrypt.hash.mockResolvedValue(hashedPassword as never);
      prismaMock.user.create.mockResolvedValue(createdUser);

      const result = await authService.createUser(userData);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith(userData.password, 10);
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          passwordHash: hashedPassword,
        },
        select: expect.any(Object),
      });
      expect(result).toEqual(expect.objectContaining({
        id: createdUser.id,
        email: createdUser.email,
        firstName: createdUser.firstName,
        lastName: createdUser.lastName,
      }));
    });

    it('should throw error if email already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      prismaMock.user.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(authService.createUser(userData)).rejects.toThrow();
    });
  });

  describe('validateUser', () => {
    it('should return user if credentials are valid', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const hashedPassword = 'hashedPassword123';

      const user = {
        id: 'user-id',
        email,
        passwordHash: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        isPremium: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const result = await authService.validateUser(email, password);

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toEqual(expect.objectContaining({
        id: user.id,
        email: user.email,
      }));
    });

    it('should return null if user not found', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await authService.validateUser(email, password);

      expect(result).toBeNull();
    });

    it('should return null if password is invalid', async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';
      const hashedPassword = 'hashedPassword123';

      const user = {
        id: 'user-id',
        email,
        passwordHash: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        isPremium: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      const result = await authService.validateUser(email, password);

      expect(result).toBeNull();
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        isPremium: false,
      };

      const accessToken = 'access-token';
      const refreshToken = 'refresh-token';

      mockedJwt.sign
        .mockReturnValueOnce(accessToken as never)
        .mockReturnValueOnce(refreshToken as never);

      prismaMock.session.create.mockResolvedValue({
        id: 'session-id',
        userId: user.id,
        refreshToken,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.generateTokens(user);

      expect(mockedJwt.sign).toHaveBeenCalledTimes(2);
      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: {
          userId: user.id,
          refreshToken,
          expiresAt: expect.any(Date),
        },
      });
      expect(result).toEqual({
        accessToken,
        refreshToken,
      });
    });
  });

  describe('refreshTokens', () => {
    it('should generate new tokens if refresh token is valid', async () => {
      const refreshToken = 'valid-refresh-token';
      const userId = 'user-id';
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      const session = {
        id: 'session-id',
        userId,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        createdAt: new Date(),
        user: {
          id: userId,
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          isPremium: false,
        },
      };

      prismaMock.session.findUnique.mockResolvedValue(session);
      mockedJwt.sign
        .mockReturnValueOnce(newAccessToken as never)
        .mockReturnValueOnce(newRefreshToken as never);
      prismaMock.session.update.mockResolvedValue({
        ...session,
        refreshToken: newRefreshToken,
      });

      const result = await authService.refreshTokens(refreshToken);

      expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
        where: { refreshToken },
        include: { user: true },
      });
      expect(prismaMock.session.update).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: expect.objectContaining({
          id: userId,
          email: 'test@example.com',
        }),
      });
    });

    it('should throw error if refresh token is invalid', async () => {
      const refreshToken = 'invalid-refresh-token';

      prismaMock.session.findUnique.mockResolvedValue(null);

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow('Invalid refresh token');
    });

    it('should throw error if refresh token is expired', async () => {
      const refreshToken = 'expired-refresh-token';
      const session = {
        id: 'session-id',
        userId: 'user-id',
        refreshToken,
        expiresAt: new Date(Date.now() - 1000), // Expired
        createdAt: new Date(),
        user: {
          id: 'user-id',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          isPremium: false,
        },
      };

      prismaMock.session.findUnique.mockResolvedValue(session);

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow('Refresh token expired');
    });
  });

  describe('revokeRefreshToken', () => {
    it('should delete the session with the given refresh token', async () => {
      const refreshToken = 'refresh-token-to-revoke';

      prismaMock.session.delete.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        refreshToken,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      await authService.revokeRefreshToken(refreshToken);

      expect(prismaMock.session.delete).toHaveBeenCalledWith({
        where: { refreshToken },
      });
    });
  });
});
