import { createContext, useContext, useState, useCallback } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return authService.getCurrentUser();
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  const signIn = useCallback(async ({ email, password }) => {
    setIsLoading(true);
    try {
      const result = await authService.signIn({ email, password });
      if (result.success) {
        setUser(result.user);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (formData) => {
    setIsLoading(true);
    try {
      const result = await authService.signUp(formData);
      if (result.success) {
        setUser(result.user);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    authService.signOut();
    setUser(null);
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    return await authService.requestPasswordReset(email);
  }, []);

  const validateResetToken = useCallback(async (token) => {
    return await authService.validateResetToken(token);
  }, []);

  const resetPassword = useCallback(async ({ token, newPassword, confirmPassword }) => {
    return await authService.resetPassword({ token, newPassword, confirmPassword });
  }, []);

  const quickSwitchUser = useCallback(async (email) => {
    setIsLoading(true);
    try {
      const res = await authService.signIn({ email, password: 'Password123!' });
      if (res.success) {
        setUser(res.user);
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetDemoData = useCallback(() => {
    authService.resetToInitialData();
    setUser(null);
    window.location.href = '/signin';
  }, []);

  const value = {
    user,
    isLoading,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    validateResetToken,
    resetPassword,
    quickSwitchUser,
    resetDemoData
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

