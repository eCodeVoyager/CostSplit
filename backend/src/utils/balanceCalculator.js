/**
 * Calculate balances for all members based on expenses
 * Positive balance = member should receive money (creditor)
 * Negative balance = member owes money (debtor)
 */
const calculateBalances = (members, expenses) => {
  const balances = {};

  // Initialize all members with 0 balance
  members.forEach((member) => {
    balances[member._id.toString()] = {
      memberId: member._id,
      memberName: member.name,
      balance: 0,
    };
  });

  // Process each expense
  expenses.forEach((expense) => {
    const totalMembers = expense.memberCountAtTime;
    const sharePerPerson = expense.amount / totalMembers;
    const payerId = expense.paidBy._id ? expense.paidBy._id.toString() : expense.paidBy.toString();

    // The payer gets credited the full amount (they paid it)
    if (balances[payerId]) {
      balances[payerId].balance += expense.amount;
    }

    // Everyone (including payer) gets debited their share
    members.forEach((member) => {
      const memberId = member._id.toString();
      if (balances[memberId]) {
        balances[memberId].balance -= sharePerPerson;
      }
    });
  });

  // Round balances to 2 decimal places
  Object.keys(balances).forEach((key) => {
    balances[key].balance = Math.round(balances[key].balance * 100) / 100;
  });

  return Object.values(balances);
};

/**
 * Generate settlement transactions using greedy algorithm
 * Returns array of {from, to, amount} representing "from owes to: amount"
 */
const generateSettlements = (balances) => {
  const settlements = [];

  // Separate creditors (positive) and debtors (negative)
  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);

  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b, balance: Math.abs(b.balance) }))
    .sort((a, b) => b.balance - a.balance);

  let i = 0;
  let j = 0;

  // Greedy algorithm: match largest debtor with largest creditor
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const settlementAmount = Math.min(debtor.balance, creditor.balance);

    if (settlementAmount > 0.01) {
      settlements.push({
        from: debtor.memberName,
        fromId: debtor.memberId,
        to: creditor.memberName,
        toId: creditor.memberId,
        amount: Math.round(settlementAmount * 100) / 100,
      });
    }

    debtor.balance -= settlementAmount;
    creditor.balance -= settlementAmount;

    if (debtor.balance < 0.01) i++;
    if (creditor.balance < 0.01) j++;
  }

  return settlements;
};

module.exports = {
  calculateBalances,
  generateSettlements,
};
