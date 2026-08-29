import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const token = localStorage.getItem('pinakee_token');

    // Resolve the socket server host from configuration or environment
    const rawApiUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    let hostUrl = '';

    if (rawApiUrl.startsWith('http')) {
      hostUrl = rawApiUrl.replace(/\/api$/, '');
    } else {
      hostUrl = window.location.origin;
    }

    const socketInstance = io(hostUrl, {
      auth: {
        token
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    socketInstance.on('connect', () => {
      console.log('Socket.IO client connected successfully');
    });

    socketInstance.on('connect_error', (err) => {
      console.error('Socket.IO connection error:', err.message);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket.IO client disconnected:', reason);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
export default SocketContext;
