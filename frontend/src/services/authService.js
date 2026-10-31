/**
 * Brightloop Authentication & User Management Service Adapter
 * 
 * Provides mock service behavior enforcing:
 * - Email uniqueness at service boundary
 * - Strict password complexity validation (>8 chars, uppercase, lowercase, special char)
 * - Role-based authorization at service methods
 * - Token-based password reset simulation with expiration and one-time use
 * 
 * Easily replaceable with a real backend API client.
 */

import { INITIAL_USERS } from './mockData';

const STORAGE_USERS_KEY = 'brightloop_users_v1';
const STORAGE_CURRENT_USER_KEY = 'brightloop_current_user_v1';
const STORAGE_RESET_TOKENS_KEY = 'brightloop_reset_tokens_v1';

// Seed initial users if none exist in localStorage
function getStoredUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(INITIAL_USERS));
      return INITIAL_USERS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_USERS;
  }
}

function saveStoredUsers(users) {
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
}

function getStoredResetTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_RESET_TOKENS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredResetTokens(tokens) {
  localStorage.setItem(STORAGE_RESET_TOKENS_KEY, JSON.stringify(tokens));
}

// Simulate network latency for realistic loading states
const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validate password requirements:
 * - Longer than 8 characters (length >= 9)
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one special character
 */
export function validatePasswordRules(password = '') {
  const hasMinLength = password.length > 8; // "longer than 8 characters"
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  return {
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasSpecial,
    isValid: hasMinLength && hasUppercase && hasLowercase && hasSpecial
  };
}

export function validateEmailFormat(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export const authService = {
  /**
   * Get currently authenticated user from session storage
   */
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_CURRENT_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Sign In user with email and password
   */
  async signIn({ email, password }) {
    await delay(400);

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      return {
        success: false,
        error: 'Please enter both email and password.'
      };
    }

    const users = getStoredUsers();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!user || user.password !== password) {
      return {
        success: false,
        error: 'Invalid email or password. Please verify your credentials.'
      };
    }

    if (user.status === 'inactive') {
      return {
        success: false,
        error: 'This account has been deactivated. Please contact support.'
      };
    }

    // Clone user without password for session security
    const { password: _, ...safeUser } = user;
    localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(safeUser));

    return {
      success: true,
      user: safeUser,
      token: `bl_tok_${Date.now()}_${safeUser.id}`
    };
  },

  /**
   * Sign Up small business customer
   */
  async signUp({ email, password, confirmPassword, name, organization }) {
    await delay(500);

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    const cleanOrg = (organization || '').trim();

    // 1. Validation checks
    const fieldErrors = {};

    if (!cleanEmail) {
      fieldErrors.email = 'Email address is required.';
    } else if (!validateEmailFormat(cleanEmail)) {
      fieldErrors.email = 'Please enter a valid email address.';
    }

    if (!cleanName) {
      fieldErrors.name = 'Full name is required.';
    }

    const pwRules = validatePasswordRules(password);
    if (!password) {
      fieldErrors.password = 'Password is required.';
    } else if (!pwRules.isValid) {
      fieldErrors.password = 'Password does not meet the security requirements.';
    }

    if (!confirmPassword) {
      fieldErrors.confirmPassword = 'Confirm password is required.';
    } else if (password !== confirmPassword) {
      fieldErrors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        error: 'Please resolve the highlighted validation errors.',
        fieldErrors
      };
    }

    // 2. Enforce unique email at the service boundary
    const users = getStoredUsers();
    const emailExists = users.some((u) => u.email.toLowerCase() === cleanEmail);

    if (emailExists) {
      return {
        success: false,
        error: 'An account with this email address already exists.',
        fieldErrors: {
          email: 'This email is already registered. Please sign in instead.'
        }
      };
    }

    // 3. Create new Customer account
    const newCustomerId = `cust_${cleanOrg.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'biz'}_${Date.now().toString().slice(-4)}`;
    const newUser = {
      id: `user_cust_${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      password,
      role: 'customer',
      customerId: newCustomerId,
      organization: cleanOrg || `${cleanName}'s Business`,
      businessSize: '1-10 employees',
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    users.push(newUser);
    saveStoredUsers(users);

    const { password: _, ...safeUser } = newUser;
    localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(safeUser));

    return {
      success: true,
      user: safeUser,
      token: `bl_tok_${Date.now()}_${safeUser.id}`
    };
  },

  /**
   * Request password reset link
   */
  async requestPasswordReset(email) {
    await delay(450);

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !validateEmailFormat(cleanEmail)) {
      return {
        success: false,
        error: 'Please provide a valid email address.'
      };
    }

    const users = getStoredUsers();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    // Security practice: Always respond with success message so external parties cannot enumerate emails.
    // However, if user exists, generate active reset token.
    let demoResetToken = null;

    if (user) {
      const tokens = getStoredResetTokens();
      demoResetToken = `rst_${Math.random().toString(36).substring(2, 10)}${Date.now()}`;
      
      // Store token with 15 minutes expiration
      tokens.push({
        token: demoResetToken,
        userId: user.id,
        email: user.email,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins
        used: false
      });
      saveStoredResetTokens(tokens);
    }

    return {
      success: true,
      message: 'If an account matches this email, instructions to reset your password have been generated.',
      // For testing & evaluation convenience in mock mode:
      demoToken: demoResetToken,
      demoResetUrl: demoResetToken ? `/reset-password?token=${demoResetToken}` : null
    };
  },

  /**
   * Validate password reset token
   */
  async validateResetToken(token) {
    await delay(250);

    if (!token) {
      return {
        valid: false,
        error: 'Missing reset token.'
      };
    }

    const tokens = getStoredResetTokens();
    const tokenRecord = tokens.find((t) => t.token === token);

    if (!tokenRecord) {
      return {
        valid: false,
        error: 'This password reset link is invalid or has expired.'
      };
    }

    if (tokenRecord.used) {
      return {
        valid: false,
        error: 'This password reset link has already been used. Please request a new one.'
      };
    }

    if (Date.now() > tokenRecord.expiresAt) {
      return {
        valid: false,
        error: 'This password reset link has expired (links are valid for 15 minutes).'
      };
    }

    return {
      valid: true,
      email: tokenRecord.email
    };
  },

  /**
   * Reset Password with valid token
   */
  async resetPassword({ token, newPassword, confirmPassword }) {
    await delay(400);

    const tokenCheck = await this.validateResetToken(token);
    if (!tokenCheck.valid) {
      return {
        success: false,
        error: tokenCheck.error
      };
    }

    const pwRules = validatePasswordRules(newPassword);
    if (!pwRules.isValid) {
      return {
        success: false,
        error: 'The new password must be longer than 8 characters and include uppercase, lowercase, and special characters.'
      };
    }

    if (newPassword !== confirmPassword) {
      return {
        success: false,
        error: 'Passwords do not match.'
      };
    }

    // Update user password
    const users = getStoredUsers();
    const userIndex = users.findIndex((u) => u.email.toLowerCase() === tokenCheck.email.toLowerCase());

    if (userIndex === -1) {
      return {
        success: false,
        error: 'User associated with this reset link was not found.'
      };
    }

    users[userIndex].password = newPassword;
    saveStoredUsers(users);

    // Mark token as used
    const tokens = getStoredResetTokens();
    const tokenRecord = tokens.find((t) => t.token === token);
    if (tokenRecord) {
      tokenRecord.used = true;
      saveStoredResetTokens(tokens);
    }

    return {
      success: true,
      message: 'Your password has been successfully reset. You can now sign in with your new password.'
    };
  },

  /**
   * Add Staff Member - Admin Only
   */
  async addStaffMember(adminUser, { name, email, role = 'staff', title, temporaryPassword }) {
    await delay(400);

    // Role check at service boundary
    if (!adminUser || adminUser.role !== 'admin') {
      return {
        success: false,
        error: 'Access denied: Only administrators have permission to add staff members.'
      };
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    const cleanTitle = (title || 'Operations Specialist').trim();

    if (!cleanEmail || !validateEmailFormat(cleanEmail)) {
      return {
        success: false,
        error: 'Please provide a valid work email address.'
      };
    }

    if (!cleanName) {
      return {
        success: false,
        error: 'Staff member full name is required.'
      };
    }

    const pwRules = validatePasswordRules(temporaryPassword);
    if (!pwRules.isValid) {
      return {
        success: false,
        error: 'Temporary password must be longer than 8 characters and include uppercase, lowercase, and special characters.'
      };
    }

    // Check unique email
    const users = getStoredUsers();
    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return {
        success: false,
        error: 'An account with this email address already exists.'
      };
    }

    const newStaff = {
      id: `user_staff_${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      password: temporaryPassword,
      role: role || 'staff',
      title: cleanTitle,
      organization: 'Brightloop Team',
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    users.push(newStaff);
    saveStoredUsers(users);

    const { password: _pw, ...safeStaff } = newStaff;
    return {
      success: true,
      user: safeStaff
    };
  },

  /**
   * Get all staff members (accessible by admin)
   */
  async getStaffMembers(currentUser) {
    await delay(200);

    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'Forbidden: Insufficient privileges.'
      };
    }

    const users = getStoredUsers();
    const staffList = users
      .filter((u) => u.role === 'admin' || u.role === 'staff')
      .map(({ password: _pw, ...safe }) => safe);

    return {
      success: true,
      data: staffList
    };
  },

  /**
   * Sign Out
   */
  signOut() {
    localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
    return { success: true };
  },

  /**
   * Reset mock data to default seed
   */
  resetToInitialData() {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(INITIAL_USERS));
    localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
    localStorage.removeItem(STORAGE_RESET_TOKENS_KEY);
    return INITIAL_USERS;
  }
};

