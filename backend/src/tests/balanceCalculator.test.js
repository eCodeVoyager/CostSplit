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

  describe('Custom Shares', () => {
    it('should calculate balances correctly with custom shares (unequal splitting)', () => {
      const members = [
        { _id: 'A', name: 'A' },
        { _id: 'B', name: 'B' },
        { _id: 'C', name: 'C' },
        { _id: 'D', name: 'D' },
      ];

      // Total 320: A costs 50, B costs 80, C costs 80, D costs 110
      // Paid by: A pays 200, B pays 120
      const expenses = [
        {
          amount: 320,
          payers: [
            { member: { _id: 'A' }, amount: 200 },
            { member: { _id: 'B' }, amount: 120 },
          ],
          customShares: [
            { member: { _id: 'A' }, amount: 50 },
            { member: { _id: 'B' }, amount: 80 },
            { member: { _id: 'C' }, amount: 80 },
            { member: { _id: 'D' }, amount: 110 },
          ],
          memberCountAtTime: 4,
        },
      ];

      const balances = calculateBalances(members, expenses);

      expect(balances).toHaveLength(4);

      const aBalance = balances.find(b => b.memberId === 'A');
      expect(aBalance.balance).toBe(150); // Paid 200, owes 50 = +150

      const bBalance = balances.find(b => b.memberId === 'B');
      expect(bBalance.balance).toBe(40); // Paid 120, owes 80 = +40

      const cBalance = balances.find(b => b.memberId === 'C');
      expect(cBalance.balance).toBe(-80); // Paid 0, owes 80 = -80

      const dBalance = balances.find(b => b.memberId === 'D');
      expect(dBalance.balance).toBe(-110); // Paid 0, owes 110 = -110
    });

    it('should handle mixed custom shares and multi-payer', () => {
      const members = [
        { _id: '1', name: 'Ehsan' },
        { _id: '2', name: 'Sakib' },
        { _id: '3', name: 'Rafi' },
      ];

      // Expense: 300 total
      // Ehsan paid 150, Sakib paid 150
      // Ehsan's share: 100, Sakib's share: 50, Rafi's share: 150
      const expenses = [
        {
          amount: 300,
          payers: [
            { member: { _id: '1' }, amount: 150 },
            { member: { _id: '2' }, amount: 150 },
          ],
          customShares: [
            { member: { _id: '1' }, amount: 100 },
            { member: { _id: '2' }, amount: 50 },
            { member: { _id: '3' }, amount: 150 },
          ],
          memberCountAtTime: 3,
        },
      ];

      const balances = calculateBalances(members, expenses);

      const ehsanBalance = balances.find(b => b.memberId === '1');
      expect(ehsanBalance.balance).toBe(50); // Paid 150, owes 100 = +50

      const sakibBalance = balances.find(b => b.memberId === '2');
      expect(sakibBalance.balance).toBe(100); // Paid 150, owes 50 = +100

      const rafiBalance = balances.find(b => b.memberId === '3');
      expect(rafiBalance.balance).toBe(-150); // Paid 0, owes 150 = -150
    });

    it('should fall back to equal split when no custom shares', () => {
      const members = [
        { _id: '1', name: 'Ehsan' },
        { _id: '2', name: 'Sakib' },
      ];

      // Multi-payer but equal split
      const expenses = [
        {
          amount: 200,
          payers: [
            { member: { _id: '1' }, amount: 100 },
            { member: { _id: '2' }, amount: 100 },
          ],
          sharedBy: [{ _id: '1' }, { _id: '2' }],
          memberCountAtTime: 2,
        },
      ];

      const balances = calculateBalances(members, expenses);

      // Both paid 100, both owe 100 -> balanced
      const ehsanBalance = balances.find(b => b.memberId === '1');
      expect(ehsanBalance.balance).toBe(0);

      const sakibBalance = balances.find(b => b.memberId === '2');
      expect(sakibBalance.balance).toBe(0);
    });
  });
});
