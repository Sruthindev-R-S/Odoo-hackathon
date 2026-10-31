/**
 * Brightloop Authentication Service
 * 
 * Enforces:
 * - Email uniqueness at service boundary
 * - Strict password complexity validation (>8 chars, uppercase, lowercase, special char)
 * - Single-use token-based password reset verification
 */

const STORAGE_USERS_KEY = 'brightloop_users_v1';
const STORAGE_CURRENT_USER_KEY = 'brightloop_current_user_v1';
const STORAGE_RESET_TOKENS_KEY = 'brightloop_reset_tokens_v1';

function getStoredUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
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

const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validate password requirements:
 * - Longer than 8 characters (length >= 9)
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one special character
 */
export function validatePasswordRules(password = '') {
  const hasMinLength = password.length > 8;
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
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_CURRENT_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async signIn({ email, password }) {
    await delay(350);

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

    if (user.isActive === false) {
      return {
        success: false,
        error: 'This account has been deactivated by an administrator.'
      };
    }

    const { password: _pw, ...safeUser } = user;
    localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(safeUser));

    return {
      success: true,
      user: safeUser,
      token: `bl_tok_${Date.now()}_${safeUser.id}`
    };
  },

  async signUp({ email, password, confirmPassword, name, organization }) {
    await delay(450);

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    const cleanOrg = (organization || '').trim();

    const fieldErrors = {};

    if (!cleanEmail) {
      fieldErrors.email = 'Email address is required.';
    } else if (!validateEmailFormat(cleanEmail)) {
      fieldErrors.email = 'Please enter a valid work email address.';
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

    const newCustomerId = `cust_${cleanOrg.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'biz'}_${Date.now().toString().slice(-4)}`;
    const newUser = {
      id: `user_${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      password,
      role: 'customer',
      customerId: newCustomerId,
      organization: cleanOrg || `${cleanName}'s Business`,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveStoredUsers(users);

    const { password: _pw, ...safeUser } = newUser;
    localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(safeUser));

    return {
      success: true,
      user: safeUser,
      token: `bl_tok_${Date.now()}_${safeUser.id}`
    };
  },

  async requestPasswordReset(email) {
    await delay(350);

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !validateEmailFormat(cleanEmail)) {
      return {
        success: false,
        error: 'Please provide a valid email address.'
      };
    }

    const users = getStoredUsers();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (user) {
      const tokens = getStoredResetTokens();
      const resetToken = `rst_${Math.random().toString(36).substring(2, 10)}${Date.now()}`;
      
      tokens.push({
        token: resetToken,
        userId: user.id,
        email: user.email,
        expiresAt: Date.now() + 15 * 60 * 1000,
        used: false
      });
      saveStoredResetTokens(tokens);
    }

    return {
      success: true,
      message: 'If an account matches this email, instructions to reset your password have been sent.'
    };
  },

  async validateResetToken(token) {
    await delay(200);

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

  async resetPassword({ token, newPassword, confirmPassword }) {
    await delay(350);

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

  signOut() {
    localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
    return { success: true };
  },

  async getStaffMembers(actorUser) {
    await delay(100);
    if (actorUser && actorUser.role !== 'admin') {
      return {
        success: false,
        error: 'Only administrators are authorized to view staff accounts.'
      };
    }

    const users = getStoredUsers();
    const staff = users
      .filter((u) => u.role === 'staff')
      .map(({ password: _pw, ...safeUser }) => safeUser);

    return {
      success: true,
      data: staff
    };
  },

  async createStaffMember(actorUser, { name, email, title, password }) {
    await delay(180);
    if (actorUser && actorUser.role !== 'admin') {
      return {
        success: false,
        error: 'Only administrators can create staff accounts.'
      };
    }

    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanTitle = (title || 'Operations Specialist').trim();

    const fieldErrors = {};
    if (!cleanName) fieldErrors.name = 'Full name is required.';
    if (!cleanEmail) {
      fieldErrors.email = 'Work email is required.';
    } else if (!validateEmailFormat(cleanEmail)) {
      fieldErrors.email = 'Enter a valid email address.';
    }

    const pwRules = validatePasswordRules(password);
    if (!password) {
      fieldErrors.password = 'Temporary password is required.';
    } else if (!pwRules.isValid) {
      fieldErrors.password = 'Password must be over 8 characters with uppercase, lowercase, and special characters.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        error: 'Please check the highlighted fields.',
        fieldErrors
      };
    }

    const users = getStoredUsers();
    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return {
        success: false,
        error: 'An account with this email address already exists.',
        fieldErrors: {
          email: 'This email is already registered.'
        }
      };
    }

    const newStaff = {
      id: `staff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      email: cleanEmail,
      password,
      role: 'staff',
      title: cleanTitle,
      isActive: true,
      organization: actorUser?.organization || 'Brightloop',
      createdAt: new Date().toISOString()
    };

    users.unshift(newStaff);
    saveStoredUsers(users);

    const { password: _pw, ...safeStaff } = newStaff;
    return {
      success: true,
      data: safeStaff
    };
  },

  async toggleStaffStatus(actorUser, staffId) {
    await delay(100);
    if (actorUser && actorUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized action.' };
    }

    const users = getStoredUsers();
    const idx = users.findIndex((u) => u.id === staffId && u.role === 'staff');
    if (idx === -1) {
      return { success: false, error: 'Staff member not found.' };
    }

    users[idx].isActive = users[idx].isActive === false ? true : false;
    saveStoredUsers(users);

    const { password: _pw, ...safeStaff } = users[idx];
    return { success: true, data: safeStaff };
  },

  async deleteStaffMember(actorUser, staffId) {
    await delay(100);
    if (actorUser && actorUser.role !== 'admin') {
      return { success: false, error: 'Unauthorized action.' };
    }

    const users = getStoredUsers();
    const filtered = users.filter((u) => !(u.id === staffId && u.role === 'staff'));
    saveStoredUsers(filtered);
    return { success: true };
  },

  async getCustomers() {
    await delay(80);
    const users = getStoredUsers();
    return users
      .filter((u) => u.role === 'customer')
      .map(({ password: _pw, ...safeUser }) => safeUser);
  },

  updateCurrentUserRole(newRole) {
    if (!['admin', 'staff', 'customer'].includes(newRole)) {
      return null;
    }
    const current = this.getCurrentUser();
    if (!current) return null;

    const updatedCurrent = {
      ...current,
      role: newRole,
      customerId: current.customerId || `cust_${current.id}`
    };
    localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(updatedCurrent));

    const users = getStoredUsers();
    const idx = users.findIndex((u) => u.id === current.id || u.email.toLowerCase() === current.email.toLowerCase());
    if (idx !== -1) {
      users[idx] = { ...users[idx], role: newRole, customerId: updatedCurrent.customerId };
      saveStoredUsers(users);
    }

    return updatedCurrent;
  }
};
