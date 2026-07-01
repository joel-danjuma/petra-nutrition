export const formatDate = (date: Date | string, format: 'short' | 'long' | 'relative' = 'short'): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (format === 'relative') {
    return getRelativeTime(dateObj);
  }
  
  const options: Intl.DateTimeFormatOptions = format === 'long' 
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
    
  return dateObj.toLocaleDateString(undefined, options);
};

export const getRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return formatDate(date, 'short');
};

export const isExpiringSoon = (expirationDate: Date | string, daysThreshold: number = 7): boolean => {
  const expDate = typeof expirationDate === 'string' ? new Date(expirationDate) : expirationDate;
  const now = new Date();
  const diffInDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  return diffInDays <= daysThreshold && diffInDays >= 0;
};

export const isExpired = (expirationDate: Date | string): boolean => {
  const expDate = typeof expirationDate === 'string' ? new Date(expirationDate) : expirationDate;
  const now = new Date();
  
  return expDate.getTime() < now.getTime();
};

export const getDaysUntilExpiration = (expirationDate: Date | string): number => {
  const expDate = typeof expirationDate === 'string' ? new Date(expirationDate) : expirationDate;
  const now = new Date();
  
  return Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

export const formatDateRange = (startDate: Date | string, endDate: Date | string): string => {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  const startFormatted = formatDate(start, 'short');
  const endFormatted = formatDate(end, 'short');
  
  if (startFormatted === endFormatted) {
    return startFormatted;
  }
  
  return `${startFormatted} - ${endFormatted}`;
};

export const getWeekDates = (startDate?: Date): Date[] => {
  const start = startDate || new Date();
  const dates: Date[] = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date);
  }
  
  return dates;
};

export const formatDateForAPI = (date: Date): string => {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
};

export const parseDateFromAPI = (dateString: string): Date => {
  return new Date(dateString + 'T00:00:00.000Z');
};
