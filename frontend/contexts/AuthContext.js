import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import toast from 'react-hot-toast';
import { authAPI } from '../lib/api';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  // Check if user is authenticated on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = Cookies.get('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await authAPI.getMe();
      setUser(response.data.user);
      setIsAuthenticated(true);
    } catch (error) {
      // Token is invalid, remove it
      Cookies.remove('token');
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authAPI.login({ email, password });
      const { token, user } = response.data;

      // Store token in cookie
      Cookies.set('token', token, { expires: 7 }); // 7 days
      
      setUser(user);
      setIsAuthenticated(true);
      
      toast.success('Welcome back!');
      router.push('/dashboard');
      
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Login failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const register = async (userData) => {
    try {
      const response = await authAPI.register(userData);
      const { token, user } = response.data;

      // Store token in cookie
      Cookies.set('token', token, { expires: 7 });
      
      setUser(user);
      setIsAuthenticated(true);
      
      toast.success('Account created successfully!');
      router.push('/dashboard');
      
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Registration failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const logout = () => {
    Cookies.remove('token');
    setUser(null);
    setIsAuthenticated(false);
    toast.success('Logged out successfully');
    router.push('/');
  };

  const updateUser = (userData) => {
    setUser(prev => ({ ...prev, ...userData }));
  };

  const refreshUser = async () => {
    try {
      const response = await authAPI.getMe();
      setUser(response.data.user);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const canPerformAction = (action) => {
    if (!user) return false;

    const now = new Date();
    if (user.planExpiresAt && now > new Date(user.planExpiresAt)) {
      return false;
    }

    switch (action) {
      case 'cv_scan':
        if (user.plan === 'free') return false;
        if (user.plan === 'one-time') return user.usage.cvScans < 1;
        if (user.plan === 'basic') return user.usage.cvScans < 5;
        if (user.plan === 'pro') return true;
        return false;
        
      case 'linkedin_scan':
        if (user.plan === 'free') return false;
        if (user.plan === 'one-time') return user.usage.linkedinScans < 1;
        if (user.plan === 'basic') return user.usage.linkedinScans < 5;
        if (user.plan === 'pro') return true;
        return false;
        
      case 'pdf_export':
        return user.plan !== 'free';
        
      case 'api_access':
        return user.plan === 'pro';
        
      case 'comparison_view':
        return user.plan === 'pro';
        
      case 'admin_access':
        return user.isAdmin;
        
      default:
        return false;
    }
  };

  const getRemainingScans = (type) => {
    if (!user) return 0;
    
    if (user.plan === 'pro') return -1; // Unlimited
    
    const limits = {
      'one-time': 1,
      'basic': 5,
      'free': 0
    };
    
    const limit = limits[user.plan] || 0;
    const used = type === 'cv' ? user.usage.cvScans : user.usage.linkedinScans;
    
    return Math.max(0, limit - used);
  };

  const getPlanLimits = () => {
    const limits = {
      'free': { cvScans: 0, linkedinScans: 0, pdfExport: false, apiAccess: false, comparisonView: false },
      'one-time': { cvScans: 1, linkedinScans: 1, pdfExport: true, apiAccess: false, comparisonView: false },
      'basic': { cvScans: 5, linkedinScans: 5, pdfExport: true, apiAccess: false, comparisonView: false },
      'pro': { cvScans: -1, linkedinScans: -1, pdfExport: true, apiAccess: true, comparisonView: true }
    };
    
    return limits[user?.plan] || limits['free'];
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateUser,
    refreshUser,
    canPerformAction,
    getRemainingScans,
    getPlanLimits,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
