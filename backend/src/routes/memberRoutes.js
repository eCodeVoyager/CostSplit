const express = require('express');
const router = express.Router();
const {
  getAllMembers,
  createMember,
  deleteMember,
  getMemberCount,
} = require('../controllers/memberController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// GET /api/members
router.get('/', getAllMembers);

// GET /api/members/count
router.get('/count', getMemberCount);

// POST /api/members
router.post('/', createMember);

// DELETE /api/members/:id
router.delete('/:id', deleteMember);

module.exports = router;
