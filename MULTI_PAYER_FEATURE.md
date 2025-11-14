# Multi-Payer Feature Documentation

## Overview

The CostSplit application supports **multi-payer expenses** where multiple people can pay different amounts for a single expense. This is useful for scenarios like:

- **Example 1**: For a 100৳ expense, Person A pays 60৳ and Person B pays 40৳
- **Example 2**: For a 500৳ hotel bill, Person A pays 300৳ and Person B pays 200৳
- **Example 3**: Three people split a 900৳ dinner where Person A pays 400৳, Person B pays 300৳, and Person C pays 200৳

## How It Works

### Backend Implementation

#### 1. Data Model (`backend/src/models/Expense.js`)

The Expense model supports both single and multi-payer modes:

```javascript
{
  title: String,           // Expense title
  amount: Number,          // Total expense amount
  
  // Single payer mode (backward compatible)
  paidBy: ObjectId,        // Reference to Member who paid
  
  // Multi-payer mode
  payers: [{
    member: ObjectId,      // Reference to Member who paid
    amount: Number         // Amount paid by this member
  }],
  
  date: Date,
  memberCountAtTime: Number,
  settled: Boolean
}
```

**Rules:**
- Either `paidBy` OR `payers` must be provided (not both)
- If `payers` array is used, the sum of all payer amounts must equal the total expense amount
- Each payer amount must be greater than 0
- Maximum 20 payers per expense

#### 2. Validation (`backend/src/controllers/expenseController.js`)

The expense controller validates multi-payer input:

```javascript
// Validate each payer
for (let payer of payers) {
  - Verify member exists and is active
  - Verify amount is valid number > 0
  - Round amount to 2 decimal places
}

// Verify total matches
const totalPaid = payers.reduce((sum, p) => sum + p.amount, 0);
if (Math.abs(totalPaid - expenseAmount) > 0.01) {
  throw Error('Total payer amounts must equal expense amount');
}
```

#### 3. Balance Calculation (`backend/src/utils/balanceCalculator.js`)

The balance calculator handles multi-payer expenses correctly:

```javascript
// For multi-payer expenses:
expense.payers.forEach(payer => {
  // Credit each payer with the amount they paid
  balances[payer.member].balance += payer.amount;
});

// Everyone (including payers) gets debited their share
const sharePerPerson = expense.amount / expense.memberCountAtTime;
members.forEach(member => {
  balances[member._id].balance -= sharePerPerson;
});
```

### Frontend Implementation

#### 1. UI Toggle (`frontend/src/pages/Expenses.jsx`)

Users can toggle between single and multi-payer modes:

```jsx
<Button onClick={handleSplitPaymentToggle}>
  {isSplitPayment ? 'Single' : 'Split'}
</Button>
```

#### 2. Multi-Payer Input

When in split payment mode, users can:

1. **Select multiple payers**: Checkbox for each member
2. **Enter amounts**: Input field for each selected payer
3. **Auto-split**: Button to evenly divide the total amount among selected payers

```jsx
{splitPayers.map(payer => (
  <div>
    <Checkbox 
      checked={payer.selected}
      onChange={() => togglePayer(payer.id)}
    />
    <label>{payer.name}</label>
    <Input 
      type="number"
      value={payer.amount}
      onChange={(e) => setPayerAmount(payer.id, e.target.value)}
      disabled={!payer.selected}
    />
  </div>
))}
```

#### 3. Validation

Frontend validates before submission:

```javascript
// Check that total paid equals expense amount
const totalPaid = selectedPayers.reduce((sum, p) => sum + parseFloat(p.amount), 0);
const totalAmount = parseFloat(formData.amount);

if (Math.abs(totalPaid - totalAmount) > 0.01) {
  alert(`Total paid (৳${totalPaid}) must equal expense amount (৳${totalAmount})`);
  return;
}

// Check for negative amounts
if (selectedPayers.some(p => parseFloat(p.amount) < 0)) {
  alert('Amount cannot be negative');
  return;
}
```

## Usage Examples

### Example 1: Simple Two-Person Split

**Scenario**: 100৳ expense where A pays 60৳ and B pays 40৳

**API Request**:
```json
POST /api/expenses
{
  "title": "Lunch",
  "amount": 100,
  "payers": [
    { "member": "userId_A", "amount": 60 },
    { "member": "userId_B", "amount": 40 }
  ],
  "date": "2025-11-14"
}
```

**Balance Calculation** (assuming 3 members total):
- Each person's share: 100 ÷ 3 = 33.33৳
- Member A: Paid 60 - Owes 33.33 = **+26.67** (gets back 26.67)
- Member B: Paid 40 - Owes 33.33 = **+6.67** (gets back 6.67)
- Member C: Paid 0 - Owes 33.33 = **-33.33** (owes 33.33)

### Example 2: Three-Person Unequal Split

**Scenario**: 900৳ hotel where A pays 500৳, B pays 300৳, C pays 100৳

**API Request**:
```json
POST /api/expenses
{
  "title": "Hotel Room",
  "amount": 900,
  "payers": [
    { "member": "userId_A", "amount": 500 },
    { "member": "userId_B", "amount": 300 },
    { "member": "userId_C", "amount": 100 }
  ],
  "date": "2025-11-14"
}
```

**Balance Calculation** (assuming 3 members total):
- Each person's share: 900 ÷ 3 = 300৳
- Member A: Paid 500 - Owes 300 = **+200** (gets back 200)
- Member B: Paid 300 - Owes 300 = **0** (balanced)
- Member C: Paid 100 - Owes 300 = **-200** (owes 200)

### Example 3: Using Auto-Split

**Frontend Workflow**:
1. User enters total amount: 900৳
2. User selects 3 members as payers
3. User clicks "Auto Split" button
4. System calculates: 900 ÷ 3 = 300৳ per person
5. Each selected payer's amount is set to 300৳
6. User can adjust individual amounts if needed

## Features

### 1. Flexible Payment Distribution
- Any number of payers (1-20)
- Any distribution of amounts (as long as total matches)
- Round amounts to 2 decimal places

### 2. Auto-Split Functionality
- Automatically divides total amount among selected payers
- Handles rounding remainder (adds to first payer)
- Example: 100৳ split 3 ways = 33.33, 33.33, 33.34

### 3. Real-Time Validation
- Shows remaining amount to be allocated
- Warns if total doesn't match expense amount
- Prevents submission if validation fails

### 4. Balance Calculation
- Properly credits each payer
- Debits all members equally (including payers)
- Generates optimal settlement suggestions

### 5. CSV Export
- Exports multi-payer expenses with full details
- Format: "Split: Alice (৳60), Bob (৳40)"

## API Endpoints

### Create Expense with Multiple Payers

```http
POST /api/expenses
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Dinner at Restaurant",
  "amount": 500,
  "payers": [
    { "member": "6554abc123def456", "amount": 300 },
    { "member": "6554abc123def457", "amount": 200 }
  ],
  "date": "2025-11-14T10:00:00Z"
}
```

**Response** (201 Created):
```json
{
  "_id": "6554abc123def789",
  "title": "Dinner at Restaurant",
  "amount": 500,
  "payers": [
    {
      "member": {
        "_id": "6554abc123def456",
        "name": "Alice"
      },
      "amount": 300
    },
    {
      "member": {
        "_id": "6554abc123def457",
        "name": "Bob"
      },
      "amount": 200
    }
  ],
  "date": "2025-11-14T10:00:00.000Z",
  "memberCountAtTime": 3,
  "settled": false,
  "createdAt": "2025-11-14T10:05:00.000Z"
}
```

### Get Balances (includes multi-payer calculations)

```http
GET /api/balances
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "balances": [
    {
      "memberId": "6554abc123def456",
      "name": "Alice",
      "balance": 200.00
    },
    {
      "memberId": "6554abc123def457",
      "name": "Bob",
      "balance": 33.33
    },
    {
      "memberId": "6554abc123def458",
      "name": "Charlie",
      "balance": -233.33
    }
  ],
  "settlements": [
    {
      "from": "Charlie",
      "to": "Alice",
      "amount": 200.00
    },
    {
      "from": "Charlie",
      "to": "Bob",
      "amount": 33.33
    }
  ]
}
```

## Error Handling

### Common Errors

1. **Total Mismatch**
```json
{
  "message": "Total payer amounts (90) must equal expense amount (100)"
}
```

2. **Invalid Payer**
```json
{
  "message": "Payer member 6554abc123def456 not found or inactive"
}
```

3. **Too Many Payers**
```json
{
  "message": "Cannot have more than 20 payers"
}
```

4. **Negative Amount**
```json
{
  "message": "Each payer amount must be greater than 0"
}
```

## Testing

Comprehensive tests are available in `backend/src/tests/`:

- **expense.test.js**: Multi-payer expense creation and validation
- **balance.test.js**: Balance calculations with multi-payer expenses
- **settlement.test.js**: Settlement generation with multi-payer scenarios

Run tests:
```bash
cd backend
npm test
```

## Database Schema

The expense collection stores multi-payer data:

```javascript
{
  _id: ObjectId("..."),
  title: "Lunch",
  amount: 100,
  payers: [
    { member: ObjectId("..."), amount: 60 },
    { member: ObjectId("..."), amount: 40 }
  ],
  // paidBy is null/undefined for multi-payer expenses
  date: ISODate("2025-11-14"),
  memberCountAtTime: 3,
  settled: false,
  createdAt: ISODate("2025-11-14"),
  updatedAt: ISODate("2025-11-14")
}
```

## Backward Compatibility

The system maintains full backward compatibility:

- Old expenses with `paidBy` field continue to work
- New expenses can use either `paidBy` (single) or `payers` (multi)
- Balance calculations handle both formats
- Frontend displays both formats correctly

## Best Practices

1. **Always validate totals**: Ensure payer amounts sum to expense amount
2. **Round to 2 decimals**: Use `.toFixed(2)` for currency amounts
3. **Handle edge cases**: Empty payers, single payer in multi-mode, etc.
4. **Provide feedback**: Show users remaining amount to allocate
5. **Test thoroughly**: Cover various split scenarios in tests

## Future Enhancements

Potential improvements:

1. **Percentage-based splits**: Allow entering percentages instead of amounts
2. **Saved split templates**: Remember common split patterns
3. **Unequal share distribution**: Different members owe different amounts
4. **Partial payments**: Track who paid what over time
5. **Split history**: View past split patterns for analysis

---

For questions or issues, please refer to the main README or open an issue on GitHub.
