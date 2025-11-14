const jwt = require('jsonwebtoken');

/**
 * Login with shared credentials
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Check against environment variables (shared credentials)
    if (
      username === process.env.SHARED_USERNAME &&
      password === process.env.SHARED_PASSWORD
    ) {
      // Generate JWT token
      const token = jwt.sign(
        { username, role: 'shared' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        message: 'Login successful',
        token,
        user: { username },
      });
    } else {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Verify token validity
 */
const verifyToken = async (req, res) => {
  res.status(200).json({ message: 'Token is valid', user: req.user });
};

module.exports = {
  login,
  verifyToken,
};
