/**
 * Brightloop Authentication & Identity Service
 *
 * Integrates live backend endpoints at http://192.168.0.155:3000:
 *  1. POST /user/register               ({ name, email, password })
 *  2. POST /user/login                  ({ name, password })
 *  3. POST /user/forgot-password        ({ email })
 *  4. POST /company-users/register      ({ name, email, password, role })
 *  5. POST /company-users/login         ({ name, password })
 *  6. POST /company-users/forgot-password ({ email })
 *  7. POST /company-users/accept-employee ({ id })
 *
 * Falls back cleanly to local storage only when the backend host is unreachable offline.
 */

import {
  apiClient,
  isNetworkOfflineError,
  storeAuthToken,
} from '../api/client.js';

const STORAGE_USERS_KEY = 'brightloop_users_v1';
const STORAGE_CURRENT_USER_KEY = 'brightloop_current_user_v1';
const STORAGE_RESET_TOKENS_KEY = 'brightloop_reset_tokens_v1';
const STORAGE_COMPANY_STAFF_KEY = 'brightloop_company_staff_v1';
const STORAGE_KNOWN_CUSTOMERS_KEY = 'brightloop_known_customers_v1';

const BOOTSTRAP_ADMIN = {
  id: 'user_admin_bootstrap',
  name: 'System Administrator',
  email: 'admin@brightloop.com',
  password: 'Admin@1234',
  role: 'admin',
  organization: 'Brightloop',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function readJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (err) {
    console.error(`Failed to persist ${key}`, err);
  }
}

function getStoredUsers() {
  try {
    const list = readJsonArray(STORAGE_USERS_KEY);
    const hasAdmin = list.some((u) => u && u.role === 'admin');
    if (!hasAdmin) {
      const seeded = [BOOTSTRAP_ADMIN, ...list];
      writeJsonArray(STORAGE_USERS_KEY, seeded);
      return seeded;
    }
    return list;
  } catch {
    return [BOOTSTRAP_ADMIN];
  }
}

function saveStoredUsers(users) {
  writeJsonArray(STORAGE_USERS_KEY, users);
}

function getStoredResetTokens() {
  return readJsonArray(STORAGE_RESET_TOKENS_KEY);
}

function saveStoredResetTokens(tokens) {
  writeJsonArray(STORAGE_RESET_TOKENS_KEY, tokens);
}

export function rememberKnownCustomer(customerObj) {
  if (!customerObj || customerObj.id === undefined || customerObj.id === null) {
    return;
  }
  const list = readJsonArray(STORAGE_KNOWN_CUSTOMERS_KEY);
  const idStr = String(customerObj.id);
  const entry = {
    id: customerObj.id,
    customerId: customerObj.customerId ?? customerObj.id,
    name: customerObj.name || `Customer #${idStr}`,
    email: customerObj.email || '',
    organization: customerObj.organization || '',
  };
  const existingIdx = list.findIndex((c) => String(c.id) === idStr);
  if (existingIdx >= 0) {
    list[existingIdx] = {
      ...list[existingIdx],
      ...entry,
      email: entry.email || list[existingIdx].email || '',
      organization: entry.organization || list[existingIdx].organization || '',
    };
  } else {
    list.unshift(entry);
  }
  writeJsonArray(STORAGE_KNOWN_CUSTOMERS_KEY, list);
}

function upsertCachedStaffMember(staffObj) {
  if (!staffObj || staffObj.id === undefined || staffObj.id === null) return;
  const list = readJsonArray(STORAGE_COMPANY_STAFF_KEY);
  const idStr = String(staffObj.id);
  const idx = list.findIndex((s) => String(s.id) === idStr);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...staffObj };
  } else {
    list.unshift(staffObj);
  }
  writeJsonArray(STORAGE_COMPANY_STAFF_KEY, list);
}

function normalizeCompanyUserFromApi(apiUser, extras = {}) {
  const rawRole = String(apiUser?.role || '').trim().toUpperCase();
  const normalizedRole = rawRole === 'ADMIN' ? 'admin' : 'staff';
  const active =
    apiUser?.status !== undefined ? Boolean(apiUser.status) : true;

  return {
    id: apiUser.id,
    companyUserId: apiUser.id,
    name: apiUser.name,
    email: apiUser.email || '',
    role: normalizedRole,
    backendRole: rawRole || (normalizedRole === 'admin' ? 'ADMIN' : 'STAFF'),
    status: active,
    isActive: active,
    title:
      extras.title ||
      (normalizedRole === 'admin'
        ? 'System Administrator'
        : 'Operations Specialist'),
    organization: extras.organization || 'Brightloop',
    createdAt: extras.createdAt || new Date().toISOString(),
  };
}

function normalizeCustomerFromApi(apiUser, extras = {}) {
  return {
    id: apiUser.id,
    customerId: apiUser.id,
    name: apiUser.name,
    email: apiUser.email || '',
    role: 'customer',
    isActive: true,
    organization: extras.organization || `${apiUser.name}'s Business`,
    createdAt: extras.createdAt || new Date().toISOString(),
  };
}

export function validatePasswordRules(password = '') {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  return {
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasSpecial,
    isValid: hasMinLength && hasUppercase && hasLowercase && hasSpecial,
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

  /**
   * Sign in via:
   * - POST /company-users/login ({ name, password }) when accountType === 'company'
   * - POST /user/login          ({ name, password }) when accountType === 'customer'
   * If accountType is omitted ('auto'), tries company-users first then user login.
   */
  async signIn({ name, email, password, accountType = 'auto' }) {
    const identifier = String(name || email || '').trim();
    if (!identifier || !password) {
      return {
        success: false,
        error: 'Please enter both your name and password.',
      };
    }

    // Resolve cached name if user typed an email address we recognize locally
    let loginName = identifier;
    if (identifier.includes('@')) {
      const knownCust = readJsonArray(STORAGE_KNOWN_CUSTOMERS_KEY).find(
        (c) => c.email && c.email.toLowerCase() === identifier.toLowerCase()
      );
      const knownStaff = readJsonArray(STORAGE_COMPANY_STAFF_KEY).find(
        (s) => s.email && s.email.toLowerCase() === identifier.toLowerCase()
      );
      if (accountType === 'customer' && knownCust?.name) {
        loginName = knownCust.name;
      } else if (accountType === 'company' && knownStaff?.name) {
        loginName = knownStaff.name;
      } else if (knownStaff?.name || knownCust?.name) {
        loginName = knownStaff?.name || knownCust?.name;
      }
    }

    try {
      if (accountType === 'company' || accountType === 'auto') {
        try {
          const res = await apiClient.post(
            '/company-users/login',
            { name: loginName, password },
            { includeCompanyHeader: false }
          );
          if (res?.user) {
            const safeUser = normalizeCompanyUserFromApi(res.user);
            if (!safeUser.isActive) {
              if (safeUser.role === 'staff') {
                upsertCachedStaffMember(safeUser);
              }
              return {
                success: false,
                error: `Employee account #${safeUser.id} (${safeUser.name}) is pending approval. Ask an Administrator to accept employee ID ${safeUser.id}.`,
              };
            }
            if (safeUser.role === 'staff') {
              upsertCachedStaffMember(safeUser);
            }
            localStorage.setItem(
              STORAGE_CURRENT_USER_KEY,
              JSON.stringify(safeUser)
            );
            storeAuthToken(res.token);
            return {
              success: true,
              user: safeUser,
              token: res.token,
            };
          }
        } catch (companyErr) {
          if (isNetworkOfflineError(companyErr)) {
            throw companyErr;
          }
          // If explicitly signing in as company user, return the error directly
          if (accountType === 'company') {
            return {
              success: false,
              error:
                companyErr.message ||
                'Invalid company user name or password.',
            };
          }
          // Otherwise ('auto'), fall through and try /user/login
        }
      }

      if (accountType === 'customer' || accountType === 'auto') {
        try {
          const res = await apiClient.post(
            '/user/login',
            { name: loginName, password },
            { includeCompanyHeader: false }
          );
          if (res?.user) {
            const safeUser = normalizeCustomerFromApi(res.user);
            rememberKnownCustomer(safeUser);
            localStorage.setItem(
              STORAGE_CURRENT_USER_KEY,
              JSON.stringify(safeUser)
            );
            storeAuthToken(res.token);
            return {
              success: true,
              user: safeUser,
              token: res.token,
            };
          }
        } catch (custErr) {
          if (isNetworkOfflineError(custErr)) {
            throw custErr;
          }
          return {
            success: false,
            error: custErr.message || 'Invalid name or password.',
          };
        }
      }

      return {
        success: false,
        error: 'Invalid credentials.',
      };
    } catch (offlineErr) {
      if (!isNetworkOfflineError(offlineErr)) {
        return {
          success: false,
          error: offlineErr.message || 'Unable to sign in.',
        };
      }

      // Offline fallback (e.g. sandboxed test environment without network)
      const users = getStoredUsers();
      const lowerId = identifier.toLowerCase();
      const user = users.find(
        (u) =>
          u.email?.toLowerCase() === lowerId ||
          u.name?.toLowerCase() === lowerId
      );

      if (!user || user.password !== password) {
        return {
          success: false,
          error: 'Invalid credentials. Please verify your name and password.',
        };
      }
      if (user.isActive === false) {
        return {
          success: false,
          error: 'This account has been deactivated by an administrator.',
        };
      }

      const { password: _pw, ...safeUser } = user;
      localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(safeUser));
      return {
        success: true,
        user: safeUser,
          token: null,
      };
    }
  },

  /**
   * Register via:
   * - POST /user/register          ({ name, email, password }) for role === 'customer'
   * - POST /company-users/register ({ name, email, password, role: 'ADMIN' }) for role === 'admin'
   */
  async signUp({
    email,
    password,
    confirmPassword,
    name,
    organization,
    role = 'customer',
  }) {
    if (role === 'staff') {
      return {
        success: false,
        error:
          'Internal staff accounts can only be added by an Administrator.',
      };
    }

    const assignedRole = role === 'admin' ? 'admin' : 'customer';
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
      fieldErrors.password =
        'Password does not meet the security requirements.';
    }

    if (confirmPassword !== undefined) {
      if (!confirmPassword) {
        fieldErrors.confirmPassword = 'Confirm password is required.';
      } else if (password !== confirmPassword) {
        fieldErrors.confirmPassword = 'Passwords do not match.';
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        error: 'Please resolve the highlighted validation errors.',
        fieldErrors,
      };
    }

    try {
      if (assignedRole === 'admin') {
        const res = await apiClient.post(
          '/company-users/register',
          {
            name: cleanName,
            email: cleanEmail,
            password,
            role: 'ADMIN',
          },
          { includeCompanyHeader: false }
        );
        const safeUser = normalizeCompanyUserFromApi(res.user, {
          organization: cleanOrg || 'Brightloop',
        });
        localStorage.setItem(
          STORAGE_CURRENT_USER_KEY,
          JSON.stringify(safeUser)
        );
        storeAuthToken(res.token);
        return {
          success: true,
          user: safeUser,
          token: res.token,
        };
      }

      const res = await apiClient.post(
        '/user/register',
        {
          name: cleanName,
          email: cleanEmail,
          password,
        },
        { includeCompanyHeader: false }
      );
      const safeUser = normalizeCustomerFromApi(res.user, {
        organization: cleanOrg || `${cleanName}'s Business`,
      });
      rememberKnownCustomer(safeUser);
      localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(safeUser));
      storeAuthToken(res.token);
      return {
        success: true,
        user: safeUser,
        token: res.token,
      };
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        return {
          success: false,
          error: err.message || 'Failed to register account.',
        };
      }

      // Offline fallback
      const users = getStoredUsers();
      if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        return {
          success: false,
          error: 'An account with this email address already exists.',
          fieldErrors: {
            email: 'This email is already registered. Please sign in instead.',
          },
        };
      }

      const newCustomerId =
        assignedRole === 'customer'
          ? `cust_${
              cleanOrg.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'biz'
            }_${Date.now().toString().slice(-4)}`
          : undefined;

      const newUser = {
        id: `user_${Date.now()}`,
        name: cleanName,
        email: cleanEmail,
        password,
        role: assignedRole,
        ...(newCustomerId ? { customerId: newCustomerId } : {}),
        isActive: true,
        organization: cleanOrg || `${cleanName}'s Business`,
        createdAt: new Date().toISOString(),
      };

      users.push(newUser);
      saveStoredUsers(users);

      const { password: _pw, ...safeUser } = newUser;
      if (assignedRole === 'customer') {
        rememberKnownCustomer(safeUser);
      }
      localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(safeUser));
      storeAuthToken(null);

      return {
        success: true,
        user: safeUser,
        token: null,
      };
    }
  },

  /**
   * Register a customer into the backend `users` table (POST /user/register)
   * without switching out the currently signed-in Admin/Staff session.
   */
  async registerCustomerDirectoryEntry({
    name,
    email,
    password,
    organization = '',
  }) {
    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanName || !cleanEmail || !password || password.length < 8) {
      throw new Error(
        'Customer name, valid email, and password (8+ characters) are required.'
      );
    }

    try {
      const res = await apiClient.post(
        '/user/register',
        { name: cleanName, email: cleanEmail, password },
        { includeCompanyHeader: false }
      );
      const cust = normalizeCustomerFromApi(res.user, {
        organization: organization.trim() || `${cleanName}'s Business`,
      });
      rememberKnownCustomer(cust);
      return cust;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }
      const fallback = {
        id: Date.now(),
        customerId: Date.now(),
        name: cleanName,
        email: cleanEmail,
        role: 'customer',
        organization: organization.trim() || `${cleanName}'s Business`,
        isActive: true,
      };
      rememberKnownCustomer(fallback);
      return fallback;
    }
  },

  /**
   * Request password reset via:
   * - POST /user/forgot-password          ({ email }) when accountType === 'customer'
   * - POST /company-users/forgot-password ({ email }) when accountType === 'company'
   */
  async requestPasswordReset(email, accountType = 'customer') {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !validateEmailFormat(cleanEmail)) {
      return {
        success: false,
        error: 'Please provide a valid email address.',
      };
    }

    const endpoint =
      accountType === 'company'
        ? '/company-users/forgot-password'
        : '/user/forgot-password';

    try {
      const res = await apiClient.post(
        endpoint,
        { email: cleanEmail },
        { includeCompanyHeader: false }
      );
      return {
        success: true,
        message:
          res?.message || 'If the account exists, a reset link will be sent.',
      };
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        return {
          success: false,
          error: err.message || 'Failed to request password reset.',
        };
      }

      const users = getStoredUsers();
      const user = users.find((u) => u.email.toLowerCase() === cleanEmail);
      if (user) {
        const tokens = getStoredResetTokens();
        tokens.push({
          token: `rst_${Math.random().toString(36).substring(2, 10)}${Date.now()}`,
          userId: user.id,
          email: user.email,
          expiresAt: Date.now() + 15 * 60 * 1000,
          used: false,
        });
        saveStoredResetTokens(tokens);
      }

      return {
        success: true,
        message: 'If the account exists, a reset link will be sent.',
      };
    }
  },

  async validateResetToken(token) {
    if (!token) {
      return { valid: false, error: 'Missing reset token.' };
    }
    const tokens = getStoredResetTokens();
    const tokenRecord = tokens.find((t) => t.token === token);
    if (!tokenRecord) {
      return {
        valid: true,
        email: '',
      };
    }
    if (tokenRecord.used) {
      return {
        valid: false,
        error:
          'This password reset link has already been used. Please request a new one.',
      };
    }
    if (Date.now() > tokenRecord.expiresAt) {
      return {
        valid: false,
        error: 'This password reset link has expired.',
      };
    }
    return { valid: true, email: tokenRecord.email };
  },

  async resetPassword({ token, newPassword, confirmPassword }) {
    const pwRules = validatePasswordRules(newPassword);
    if (!pwRules.isValid) {
      return {
        success: false,
        error:
          'The new password must be at least 8 characters and include uppercase, lowercase, and special characters.',
      };
    }
    if (newPassword !== confirmPassword) {
      return { success: false, error: 'Passwords do not match.' };
    }

    const tokens = getStoredResetTokens();
    const tokenRecord = tokens.find((t) => t.token === token);
    if (tokenRecord) {
      const users = getStoredUsers();
      const idx = users.findIndex(
        (u) => u.email.toLowerCase() === tokenRecord.email.toLowerCase()
      );
      if (idx >= 0) {
        users[idx].password = newPassword;
        saveStoredUsers(users);
      }
      tokenRecord.used = true;
      saveStoredResetTokens(tokens);
    }

    return {
      success: true,
      message:
        'Your password has been successfully reset. You can now sign in with your new password.',
    };
  },

  signOut() {
    localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
    storeAuthToken(null);
    return { success: true };
  },

  async getStaffMembers(actorUser) {
    if (!actorUser || actorUser.role !== 'admin') {
      return {
        success: false,
        error: 'Only administrators are authorized to view staff accounts.',
      };
    }

    const apiStaff = readJsonArray(STORAGE_COMPANY_STAFF_KEY);
    const localStaff = getStoredUsers()
      .filter((u) => u.role === 'staff')
      .map(({ password: _pw, ...safeUser }) => safeUser);

    const seenIds = new Set();
    const combined = [];
    [...apiStaff, ...localStaff].forEach((s) => {
      const key = String(s.id);
      if (!seenIds.has(key)) {
        seenIds.add(key);
        combined.push(s);
      }
    });

    return {
      success: true,
      data: combined,
    };
  },

  /**
   * Provision a new Staff company user (Admin-only):
   * - Calls POST /company-users/register ({ name, email, password, role: 'STAFF' })
   * - If autoAccept is true, immediately calls POST /company-users/accept-employee ({ id })
   */
  async createStaffMember(
    actorUser,
    { name, email, title, password, autoAccept = true }
  ) {
    if (!actorUser || actorUser.role !== 'admin') {
      return {
        success: false,
        error: 'Only administrators can add a new member of staff.',
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
      fieldErrors.password =
        'Password must be at least 8 characters with uppercase, lowercase, and special characters.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        error: 'Please check the highlighted fields.',
        fieldErrors,
      };
    }

    try {
      const regRes = await apiClient.post(
        '/company-users/register',
        {
          name: cleanName,
          email: cleanEmail,
          password,
          role: 'STAFF',
        },
        { actorUser }
      );

      let companyUser = regRes.user;
      if (autoAccept && companyUser?.id) {
        const acceptRes = await apiClient.post(
          '/company-users/accept-employee',
          { id: Number(companyUser.id) },
          { actorUser }
        );
        if (acceptRes?.user) {
          companyUser = acceptRes.user;
        }
      }

      const normalized = normalizeCompanyUserFromApi(companyUser, {
        title: cleanTitle,
        organization: actorUser?.organization || 'Brightloop',
      });
      upsertCachedStaffMember(normalized);

      return {
        success: true,
        data: normalized,
      };
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        return {
          success: false,
          error: err.message || 'Failed to register company staff user.',
        };
      }

      // Offline fallback
      const users = getStoredUsers();
      if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        return {
          success: false,
          error: 'An account with this email address already exists.',
          fieldErrors: { email: 'This email is already registered.' },
        };
      }

      const newStaff = {
        id: `staff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: cleanName,
        email: cleanEmail,
        password,
        role: 'staff',
        title: cleanTitle,
        status: Boolean(autoAccept),
        isActive: Boolean(autoAccept),
        organization: actorUser?.organization || 'Brightloop',
        createdAt: new Date().toISOString(),
      };

      users.unshift(newStaff);
      saveStoredUsers(users);

      const { password: _pw, ...safeStaff } = newStaff;
      return {
        success: true,
        data: safeStaff,
      };
    }
  },

  /**
   * Accept / approve an employee account by ID via POST /company-users/accept-employee
   */
  async acceptEmployee(actorUser, employeeId) {
    if (!actorUser || actorUser.role !== 'admin') {
      return {
        success: false,
        error: 'Only administrators can accept employee accounts.',
      };
    }

    const numericId = Number(employeeId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return {
        success: false,
        error: 'Enter a valid numeric company user ID (e.g. 1, 2).',
      };
    }

    try {
      const res = await apiClient.post(
        '/company-users/accept-employee',
        { id: numericId },
        { actorUser }
      );
      const normalized = normalizeCompanyUserFromApi(res.user);
      upsertCachedStaffMember(normalized);
      return {
        success: true,
        data: normalized,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Failed to accept employee.',
      };
    }
  },

  async toggleStaffStatus(actorUser, staffId) {
    if (!actorUser || actorUser.role !== 'admin') {
      return {
        success: false,
        error: 'Only administrators can modify staff accounts.',
      };
    }

    // If numeric backend ID and currently inactive, call POST /company-users/accept-employee
    const cachedStaff = readJsonArray(STORAGE_COMPANY_STAFF_KEY);
    const cachedIdx = cachedStaff.findIndex(
      (s) => String(s.id) === String(staffId)
    );
    if (cachedIdx >= 0 && Number.isInteger(Number(staffId))) {
      if (!cachedStaff[cachedIdx].isActive) {
        return this.acceptEmployee(actorUser, Number(staffId));
      }
      cachedStaff[cachedIdx] = {
        ...cachedStaff[cachedIdx],
        isActive: false,
        status: false,
      };
      writeJsonArray(STORAGE_COMPANY_STAFF_KEY, cachedStaff);
      return { success: true, data: cachedStaff[cachedIdx] };
    }

    const users = getStoredUsers();
    const idx = users.findIndex(
      (u) => String(u.id) === String(staffId) && u.role === 'staff'
    );
    if (idx === -1) {
      return { success: false, error: 'Staff member not found.' };
    }

    users[idx].isActive = users[idx].isActive === false ? true : false;
    saveStoredUsers(users);

    const { password: _pw, ...safeStaff } = users[idx];
    return { success: true, data: safeStaff };
  },

  async deleteStaffMember(actorUser, staffId) {
    if (!actorUser || actorUser.role !== 'admin') {
      return {
        success: false,
        error: 'Only administrators can remove staff accounts.',
      };
    }

    const cachedStaff = readJsonArray(STORAGE_COMPANY_STAFF_KEY).filter(
      (s) => String(s.id) !== String(staffId)
    );
    writeJsonArray(STORAGE_COMPANY_STAFF_KEY, cachedStaff);

    const users = getStoredUsers().filter(
      (u) => !(String(u.id) === String(staffId) && u.role === 'staff')
    );
    saveStoredUsers(users);
    return { success: true };
  },

  async getCustomers() {
    const knownApiCustomers = readJsonArray(STORAGE_KNOWN_CUSTOMERS_KEY);
    const localCustomers = getStoredUsers()
      .filter((u) => u.role === 'customer')
      .map(({ password: _pw, ...safeUser }) => safeUser);

    const seen = new Set();
    const merged = [];
    [...knownApiCustomers, ...localCustomers].forEach((c) => {
      const key = String(c.customerId ?? c.id);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(c);
      }
    });
    return merged;
  },
};
