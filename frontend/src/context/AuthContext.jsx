import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize and check persistent session on boot
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('pinakee_token');
      if (token) {
        try {
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          const result = await res.json();
          if (res.ok && result.success) {
            setUser(result.data.user);
          } else {
            // Token expired or invalid
            logout();
          }
        } catch (error) {
          console.error('Session initialization failed:', error);
          // Keep offline state but don't clear token if it was a network error
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      const result = await res.json();
      
      if (!res.ok || !result.success) {
        return { success: false, message: result.message || 'Login failed' };
      }

      const { token, user: userData } = result.data;
      localStorage.setItem('pinakee_token', token);
      setUser(userData);
      return { success: true };
    } catch (error) {
      console.error('Login request failed:', error);
      return { success: false, message: 'Server is currently unreachable' };
    }
  };

  const logout = () => {
    localStorage.removeItem('pinakee_token');
    setUser(null);
  };

  // Wrapped fetch helper that automatically adds Authorization headers and handles 401s
  const authFetch = async (endpoint, options = {}) => {
    const token = localStorage.getItem('pinakee_token');
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      if (res.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }

      return res;
    } catch (err) {
      console.error(`API Fetch Error [${endpoint}]:`, err.message);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, authFetch, API_BASE }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
