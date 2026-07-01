import { prisma } from '../database';
import { cache } from '../config/redis';
import { logger } from '../utils/logger';

export interface ChatSessionFilters {
  query?: string;
  isActive?: boolean;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
}

export class ChatService {
  async getSessions(userId: string, filters: ChatSessionFilters) {
    const {
      query,
      isActive,
      fromDate,
      toDate,
      page = 1,
      limit = 20,
    } = filters;

    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = { userId };

    if (query) {
      where.title = { contains: query, mode: 'insensitive' };
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    try {
      const [sessions, total] = await Promise.all([
        prisma.chatSession.findMany({
          where,
          include: {
            messages: {
              orderBy: { timestamp: 'desc' },
              take: 1, // Get last message for preview
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.chatSession.count({ where }),
      ]);

      return {
        sessions: sessions.map(session => ({
          ...session,
          lastMessage: session.messages[0] || null,
          messageCount: session.messages.length,
        })),
        total,
        hasMore: offset + sessions.length < total,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get chat sessions:', error);
      throw error;
    }
  }

  async getSession(sessionId: string, userId: string) {
    try {
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' },
          },
        },
      });

      if (!session) {
        return null;
      }

      return session;
    } catch (error) {
      logger.error('Failed to get chat session:', error);
      throw error;
    }
  }

  async createSession(sessionData: any) {
    try {
      const session = await prisma.chatSession.create({
        data: sessionData,
        include: {
          messages: true,
        },
      });

      return session;
    } catch (error) {
      logger.error('Failed to create chat session:', error);
      throw error;
    }
  }

  async updateSession(sessionId: string, userId: string, updates: any) {
    try {
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        return null;
      }

      const updatedSession = await prisma.chatSession.update({
        where: { id: sessionId },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' },
          },
        },
      });

      return updatedSession;
    } catch (error) {
      logger.error('Failed to update chat session:', error);
      throw error;
    }
  }

  async deleteSession(sessionId: string, userId: string) {
    try {
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        return null;
      }

      await prisma.chatSession.delete({
        where: { id: sessionId },
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete chat session:', error);
      throw error;
    }
  }

  async clearMessages(sessionId: string, userId: string) {
    try {
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        return null;
      }

      // Delete all messages in the session
      await prisma.chatMessage.deleteMany({
        where: { sessionId },
      });

      // Return updated session
      return this.getSession(sessionId, userId);
    } catch (error) {
      logger.error('Failed to clear chat messages:', error);
      throw error;
    }
  }

  async addMessage(sessionId: string, messageData: any) {
    try {
      const message = await prisma.chatMessage.create({
        data: {
          sessionId,
          ...messageData,
        },
      });

      // Update session's updatedAt timestamp
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });

      return message;
    } catch (error) {
      logger.error('Failed to add chat message:', error);
      throw error;
    }
  }

  async getRecentMessages(sessionId: string, limit: number = 10) {
    try {
      const messages = await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return messages.reverse(); // Return in chronological order
    } catch (error) {
      logger.error('Failed to get recent messages:', error);
      throw error;
    }
  }

  async getUserProfile(userId: string) {
    try {
      return await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });
    } catch (error) {
      logger.error('Failed to get user profile:', error);
      return null;
    }
  }

  // Analytics methods
  async getChatAnalytics(userId: string) {
    try {
      const cacheKey = `chat_analytics:${userId}`;
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      const [
        totalSessions,
        totalMessages,
        recentActivity,
      ] = await Promise.all([
        prisma.chatSession.count({ where: { userId } }),
        
        prisma.chatMessage.count({
          where: {
            session: { userId },
          },
        }),
        
        prisma.chatSession.findMany({
          where: { userId, updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          include: { _count: { select: { messages: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
      ]);

      const averageSessionLength = totalSessions > 0 ? totalMessages / totalSessions : 0;

      const analytics = {
        totalSessions,
        totalMessages,
        averageSessionLength: Math.round(averageSessionLength * 10) / 10,
        recentActivity,
        lastActiveAt: recentActivity[0]?.updatedAt || null,
      };

      // Cache for 1 hour
      await cache.set(cacheKey, analytics, 3600);

      return analytics;
    } catch (error) {
      logger.error('Failed to get chat analytics:', error);
      throw error;
    }
  }

  // Auto-generate session titles based on first message
  async generateSessionTitle(sessionId: string) {
    try {
      const firstMessage = await prisma.chatMessage.findFirst({
        where: { sessionId, role: 'USER' },
        orderBy: { timestamp: 'asc' },
      });

      if (!firstMessage) {
        return 'New Chat';
      }

      // Extract meaningful title from first message content
      let content = '';
      if (Array.isArray(firstMessage.content)) {
        content = firstMessage.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join(' ');
      } else {
        content = firstMessage.content as string;
      }

      // Generate a concise title (max 50 characters)
      let title = content.substring(0, 50).trim();
      
      // Try to end at a word boundary
      const lastSpaceIndex = title.lastIndexOf(' ');
      if (lastSpaceIndex > 20) {
        title = title.substring(0, lastSpaceIndex);
      }

      // Add ellipsis if truncated
      if (content.length > title.length) {
        title += '...';
      }

      // Update session with generated title
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { title: title || 'New Chat' },
      });

      return title;
    } catch (error) {
      logger.error('Failed to generate session title:', error);
      return 'New Chat';
    }
  }

  // Search messages across all user sessions
  async searchMessages(userId: string, query: string, limit: number = 20) {
    try {
      const messages = await prisma.chatMessage.findMany({
        where: {
          session: { userId },
          // This would need to be implemented based on your JSON structure
          // For now, we'll use a simple text search
        },
        include: {
          session: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return messages;
    } catch (error) {
      logger.error('Failed to search messages:', error);
      throw error;
    }
  }

  // Export user's chat data
  async exportChatData(userId: string, format: string = 'json') {
    try {
      const sessions = await prisma.chatSession.findMany({
        where: { userId },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (format === 'json') {
        return JSON.stringify(sessions, null, 2);
      }

      // For other formats, implement as needed
      return sessions;
    } catch (error) {
      logger.error('Failed to export chat data:', error);
      throw error;
    }
  }
}
