import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';

// Global instance to prevent multiple connections in development
declare global {
  var __prisma: PrismaClient | undefined;
}

// Create Prisma client with logging
const createPrismaClient = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: config.NODE_ENV === 'test' ? config.DATABASE_URL_TEST : config.DATABASE_URL,
      },
    },
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'info', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });
};

// Initialize Prisma client
export const prisma = globalThis.__prisma || createPrismaClient();

if (config.NODE_ENV === 'development') {
  globalThis.__prisma = prisma;
}

// Setup logging for Prisma events
prisma.$on('query', (e) => {
  if (config.NODE_ENV === 'development') {
    logger.debug('Prisma Query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    });
  }
});

prisma.$on('error', (e) => {
  logger.error('Prisma Error', {
    target: e.target,
    message: e.message,
  });
});

prisma.$on('info', (e) => {
  logger.info('Prisma Info', {
    target: e.target,
    message: e.message,
  });
});

prisma.$on('warn', (e) => {
  logger.warn('Prisma Warning', {
    target: e.target,
    message: e.message,
  });
});

// Connect to database
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    
    // Test the connection
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection verified');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
};

// Disconnect from database
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
    throw error;
  }
};

// Database health check
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
};

// Transaction helper
export const withTransaction = async <T>(
  callback: (tx: PrismaClient) => Promise<T>
): Promise<T> => {
  return prisma.$transaction(callback);
};

// Common database operations
export const dbOperations = {
  // User operations
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
      },
    });
  },

  async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
      },
    });
  },

  async createUser(userData: any) {
    return prisma.user.create({
      data: userData,
      include: {
        profile: true,
      },
    });
  },

  async updateUser(id: string, userData: any) {
    return prisma.user.update({
      where: { id },
      data: userData,
      include: {
        profile: true,
      },
    });
  },

  // Recipe operations
  async findRecipeById(id: string) {
    return prisma.recipe.findUnique({
      where: { id },
      include: {
        ingredients: true,
        instructions: true,
        nutrition: true,
      },
    });
  },

  async searchRecipes(params: any) {
    return prisma.recipe.findMany({
      where: params.where,
      include: {
        ingredients: true,
        instructions: true,
        nutrition: true,
      },
      orderBy: params.orderBy,
      skip: params.skip,
      take: params.take,
    });
  },

  // Pantry operations
  async findPantryItemsByUserId(userId: string, filters?: any) {
    return prisma.pantryItem.findMany({
      where: {
        userId,
        ...filters,
      },
      orderBy: { name: 'asc' },
    });
  },

  async createPantryItem(itemData: any) {
    return prisma.pantryItem.create({
      data: itemData,
    });
  },

  async updatePantryItem(id: string, itemData: any) {
    return prisma.pantryItem.update({
      where: { id },
      data: itemData,
    });
  },

  async deletePantryItem(id: string) {
    return prisma.pantryItem.delete({
      where: { id },
    });
  },

  // Chat operations
  async findChatSessionsByUserId(userId: string) {
    return prisma.chatSession.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async createChatSession(sessionData: any) {
    return prisma.chatSession.create({
      data: sessionData,
      include: {
        messages: true,
      },
    });
  },

  async addChatMessage(messageData: any) {
    return prisma.chatMessage.create({
      data: messageData,
    });
  },
};

// Cleanup function for tests
export const cleanupDatabase = async (): Promise<void> => {
  if (config.NODE_ENV === 'test') {
    const tablenames = await prisma.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter((name) => name !== '_prisma_migrations')
      .map((name) => `"public"."${name}"`)
      .join(', ');

    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    } catch (error) {
      logger.error('Error cleaning up database:', error);
    }
  }
};
