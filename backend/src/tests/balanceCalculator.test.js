const { calculateBalances, generateSettlements } = require('../utils/balanceCalculator');

describe('Balance Calculator', () => {
  describe('calculateBalances', () => {
    it('should calculate balances correctly for simple expense', () => {
      const members = [
        { _id: '1', name: 'Ehsan' },
        { _id: '2', name: 'Sakib' },
        { _id: '3', name: 'Rafi' },
        { _id: '4', name: 'Nabil' },
      ];

      const expenses = [
        {
          amount: 1000,
          paidBy: { _id: '1' },
          memberCountAtTime: 4,
        },
      ];

      const balances = calculateBalances(members, expenses);

      expect(balances).toHaveLength(4);

      const ehsanBalance = balances.find(b => b.memberId === '1');
      expect(ehsanBalance.balance).toBe(750); // Paid 1000, owes 250 = +750

      const sakibBalance = balances.find(b => b.memberId === '2');
      expect(sakibBalance.balance).toBe(-250);

      const rafiBalance = balances.find(b => b.memberId === '3');
      expect(rafiBalance.balance).toBe(-250);

      const nabilBalance = balances.find(b => b.memberId === '4');
      expect(nabilBalance.balance).toBe(-250);
    });

    it('should handle multiple expenses correctly', () => {
      const members = [
        { _id: '1', name: 'Ehsan' },
        { _id: '2', name: 'Sakib' },
      ];

      const expenses = [
        { amount: 100, paidBy: { _id: '1' }, memberCountAtTime: 2 },
        { amount: 200, paidBy: { _id: '2' }, memberCountAtTime: 2 },
      ];

      const balances = calculateBalances(members, expenses);

      const ehsanBalance = balances.find(b => b.memberId === '1');
      expect(ehsanBalance.balance).toBe(-50); // Paid 100, owes 150 total = -50

      const sakibBalance = balances.find(b => b.memberId === '2');
      expect(sakibBalance.balance).toBe(50); // Paid 200, owes 150 total = +50
    });

    it('should handle zero expenses', () => {
      const members = [
        { _id: '1', name: 'Ehsan' },
        { _id: '2', name: 'Sakib' },
      ];

      const balances = calculateBalances(members, []);

      expect(balances).toHaveLength(2);
      balances.forEach(balance => {
        expect(balance.balance).toBe(0);
      });
    });
  });

  describe('generateSettlements', () => {
    it('should generate correct settlements for simple case', () => {
      const balances = [
        { memberId: '1', memberName: 'Ehsan', balance: 300 },
        { memberId: '2', memberName: 'Sakib', balance: -150 },
        { memberId: '3', memberName: 'Rafi', balance: -150 },
      ];

      const settlements = generateSettlements(balances);

      expect(settlements).toHaveLength(2);

      expect(settlements[0].from).toBe('Sakib');
      expect(settlements[0].to).toBe('Ehsan');
      expect(settlements[0].amount).toBe(150);

      expect(settlements[1].from).toBe('Rafi');
      expect(settlements[1].to).toBe('Ehsan');
      expect(settlements[1].amount).toBe(150);
    });

    it('should handle complex settlements', () => {
      const balances = [
        { memberId: '1', memberName: 'Ehsan', balance: 500 },
        { memberId: '2', memberName: 'Sakib', balance: 200 },
        { memberId: '3', memberName: 'Rafi', balance: -300 },
        { memberId: '4', memberName: 'Nabil', balance: -400 },
      ];

      const settlements = generateSettlements(balances);

      const totalSettlementAmount = settlements.reduce((sum, s) => sum + s.amount, 0);
      expect(totalSettlementAmount).toBe(700); // Total debt = total credit
    });

    it('should return empty array for balanced accounts', () => {
      const balances = [
        { memberId: '1', memberName: 'Ehsan', balance: 0 },
        { memberId: '2', memberName: 'Sakib', balance: 0 },
      ];

      const settlements = generateSettlements(balances);

      expect(settlements).toHaveLength(0);
    });
  });
});
