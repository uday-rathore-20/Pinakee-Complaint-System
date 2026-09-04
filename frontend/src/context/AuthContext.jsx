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

  // Wrapped fetch helper that automatically adds Authorization headers, extracts X-Request-Id,
  // normalizes error responses safely, and handles 401s
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

      // Extract backend request correlation identifier from response headers
      const requestId = res.headers ? (res.headers.get('x-request-id') || res.headers.get('x-correlation-id') || null) : null;
      res.requestId = requestId;

      // Decorate res.json to gracefully handle non-JSON / HTML / empty error bodies
      // and safely propagate the response requestId without mutating native response semantics
      const originalJson = res.json.bind(res);
      res.json = async () => {
        try {
          const data = await originalJson();
          if (data && typeof data === 'object' && requestId && !data.requestId) {
            data.requestId = requestId;
          }
          return data;
        } catch (parseErr) {
          // Graceful fallback for empty responses or HTML error pages (e.g. 502/504 proxy errors)
          const fallbackMsg = res.statusText && res.statusText.trim() ? res.statusText : `HTTP ${res.status} Error`;
          return {
            success: false,
            message: fallbackMsg,
            status: res.status,
            requestId: requestId || null
          };
        }
      };

      // Handle 401 Unauthorized / Expired JWT: clear session and throw enriched error
      if (res.status === 401) {
        logout();
        const authErr = new Error('Session expired. Please log in again.');
        authErr.status = 401;
        authErr.requestId = requestId || null;
        throw authErr;
      }

      return res;
    } catch (err) {
      if (err && err.status === 401) {
        throw err;
      }

      const isAbort = err.name === 'AbortError' || err.code === 20;
      const errorMsg = isAbort ? 'Request was cancelled.' : (err.message || 'Network connection failed.');
      console.error(`API Fetch Error [${endpoint}]:`, errorMsg);

      if (!isAbort) {
        err.status = err.status || 0;
        err.requestId = null; // Strictly zero fabrication on network failures
      }
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
