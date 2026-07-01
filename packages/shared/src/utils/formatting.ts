// Text formatting utilities
export const capitalizeFirst = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const capitalizeWords = (str: string): string => {
  return str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

export const slugify = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Number formatting
export const formatNumber = (num: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

// Unit formatting
export const formatQuantity = (amount: number, unit: string): string => {
  // Handle fractional amounts for cooking
  if (unit === 'cups' || unit === 'tbsp' || unit === 'tsp') {
    return formatFraction(amount) + ' ' + (amount === 1 ? unit.slice(0, -1) : unit);
  }
  
  // Handle whole numbers
  if (amount === Math.floor(amount)) {
    return `${amount} ${amount === 1 ? getSingularUnit(unit) : unit}`;
  }
  
  // Handle decimals
  return `${amount.toFixed(1)} ${unit}`;
};

const formatFraction = (decimal: number): string => {
  const fractions: Record<string, string> = {
    '0.125': '1/8',
    '0.25': '1/4',
    '0.333': '1/3',
    '0.5': '1/2',
    '0.667': '2/3',
    '0.75': '3/4',
  };
  
  const whole = Math.floor(decimal);
  const remainder = decimal - whole;
  
  // Find closest fraction
  let closestFraction = '';
  let closestDiff = Infinity;
  
  for (const [dec, frac] of Object.entries(fractions)) {
    const diff = Math.abs(remainder - parseFloat(dec));
    if (diff < closestDiff && diff < 0.05) {
      closestDiff = diff;
      closestFraction = frac;
    }
  }
  
  if (closestFraction) {
    return whole > 0 ? `${whole} ${closestFraction}` : closestFraction;
  }
  
  return decimal.toString();
};

const getSingularUnit = (unit: string): string => {
  const singulars: Record<string, string> = {
    'cups': 'cup',
    'tbsp': 'tbsp',
    'tsp': 'tsp',
    'pieces': 'piece',
    'slices': 'slice',
    'cloves': 'clove',
    'pounds': 'pound',
    'ounces': 'ounce',
    'grams': 'gram',
    'kilograms': 'kilogram',
    'liters': 'liter',
    'milliliters': 'milliliter',
  };
  
  return singulars[unit] || unit;
};

// Time formatting
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  }
  
  return `${hours} hr${hours > 1 ? 's' : ''} ${remainingMinutes} min`;
};

export const formatCookingTime = (prepTime: number, cookTime: number): string => {
  const total = prepTime + cookTime;
  
  if (prepTime === 0) {
    return `${formatDuration(cookTime)} cook time`;
  }
  
  if (cookTime === 0) {
    return `${formatDuration(prepTime)} prep time`;
  }
  
  return `${formatDuration(prepTime)} prep + ${formatDuration(cookTime)} cook (${formatDuration(total)} total)`;
};

// List formatting
export const formatList = (items: string[], conjunction: 'and' | 'or' = 'and'): string => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  
  const lastItem = items[items.length - 1];
  const otherItems = items.slice(0, -1);
  
  return `${otherItems.join(', ')}, ${conjunction} ${lastItem}`;
};

// File size formatting
export const formatFileSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  
  return `${size.toFixed(1)} ${sizes[i]}`;
};

// Search highlighting
export const highlightSearchTerm = (text: string, searchTerm: string): string => {
  if (!searchTerm.trim()) return text;
  
  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};

// Truncate text
export const truncateText = (text: string, maxLength: number, suffix: string = '...'): string => {
  if (text.length <= maxLength) return text;
  
  return text.substring(0, maxLength - suffix.length).trim() + suffix;
};

// Generate initials
export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('')
    .substring(0, 2);
};

// Generate random color for avatars
export const generateAvatarColor = (str: string): string => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
    '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
    '#10AC84', '#EE5A24', '#0984E3', '#A29BFE', '#FD79A8'
  ];
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};
