/**
 * Calculate balances for all members based on expenses
 * Positive balance = member should receive money (creditor)
 * Negative balance = member owes money (debtor)
 */
const calculateBalances = (members, expenses, completedSettlements = []) => {
  const balances = {};

  // Initialize all members with 0 balance
  members.forEach((member) => {
    balances[member._id.toString()] = {
      memberId: member._id,
      memberName: member.name,
      balance: 0,
    };
  });

  // Process each expense (skip settled expenses)
  expenses.forEach((expense) => {
    // Skip settled expenses
    if (expense.settled) {
      return;
    }

    // Handle multi-payer expenses (credit payers first)
    if (expense.payers && expense.payers.length > 0) {
      // Multi-payer: each payer gets credited their paid amount
      expense.payers.forEach((payer) => {
        const payerId = payer.member._id ? payer.member._id.toString() : payer.member.toString();
        if (balances[payerId]) {
          balances[payerId].balance += payer.amount;
        }
      });
    } else {
      // Single payer: credit the full amount
      const payerId = expense.paidBy._id ? expense.paidBy._id.toString() : expense.paidBy.toString();
      if (balances[payerId]) {
        balances[payerId].balance += expense.amount;
      }
    }

    // Debit members based on their share
    // If customShares are provided, use them; otherwise split equally
    if (expense.customShares && expense.customShares.length > 0) {
      // Custom shares: each member pays their specific amount
      expense.customShares.forEach((share) => {
        const memberId = share.member._id ? share.member._id.toString() : share.member.toString();
        if (balances[memberId]) {
          balances[memberId].balance -= share.amount;
        }
      });
    } else {
      // Equal split: determine which members share this expense
      // Use sharedBy if available, otherwise fall back to all members (backward compatibility)
      const membersWhoShare = expense.sharedBy && expense.sharedBy.length > 0
        ? expense.sharedBy
        : members.map(m => m._id);

      const totalSharingMembers = membersWhoShare.length;
      const sharePerPerson = expense.amount / totalSharingMembers;

      // Only members who share this expense get debited equally
      membersWhoShare.forEach((memberRef) => {
        const memberId = memberRef._id ? memberRef._id.toString() : memberRef.toString();
        if (balances[memberId]) {
          balances[memberId].balance -= sharePerPerson;
        }
      });
    }
  });

  // Apply completed settlements (adjust balances)
  completedSettlements.forEach((settlement) => {
    const fromId = settlement.from._id ? settlement.from._id.toString() : settlement.from.toString();
    const toId = settlement.to._id ? settlement.to._id.toString() : settlement.to.toString();

    // When someone pays back: debtor balance increases, creditor balance decreases
    if (balances[fromId]) {
      balances[fromId].balance += settlement.amount;
    }
    if (balances[toId]) {
      balances[toId].balance -= settlement.amount;
    }
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
