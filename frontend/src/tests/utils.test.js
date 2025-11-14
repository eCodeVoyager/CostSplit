import { formatCurrency, formatDate, cn } from '../lib/utils';

describe('Utility Functions', () => {
  describe('formatCurrency', () => {
    it('should format currency correctly', () => {
      expect(formatCurrency(100)).toBe('৳100.00');
      expect(formatCurrency(1234.56)).toBe('৳1234.56');
      expect(formatCurrency(0)).toBe('৳0.00');
    });

    it('should handle string numbers', () => {
      expect(formatCurrency('100')).toBe('৳100.00');
      expect(formatCurrency('1234.5')).toBe('৳1234.50');
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2025-11-15');
      const formatted = formatDate(date);
      expect(formatted).toContain('Nov');
      expect(formatted).toContain('2025');
    });
  });

  describe('cn', () => {
    it('should merge class names', () => {
      const result = cn('class1', 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should handle conditional classes', () => {
      const result = cn('class1', false && 'class2', 'class3');
      expect(result).toBe('class1 class3');
    });
  });
});
