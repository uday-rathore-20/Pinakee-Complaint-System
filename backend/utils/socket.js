const { Server } = require('socket.io');
const { verifyToken } = require('./jwt');
const dbPool = require('../config/db');
const logger = require('./logger');

let io = null;

/**
 * Socket.IO authentication middleware utilizing verified JWTs.
 */
const authenticateSocket = async (socket, next) => {
  try {
    // Accept token from handshake authentication or query params
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Access token is missing'));
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error('Access token is invalid or expired'));
    }

    if (!dbPool) {
      return next(new Error('Database connection is unavailable'));
    }

    const query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.is_active, u.department_id,
             r.name AS role, d.name AS department
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `;
    const result = await dbPool.query(query, [decoded.id]);

    if (result.rows.length === 0) {
      return next(new Error('User does not exist'));
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return next(new Error('User account is deactivated'));
    }

    // Attach verified user identity context to socket session
    socket.user = user;
    next();
  } catch (error) {
    console.error('Socket authentication middleware error:', error.message);
    next(new Error('Internal server error during socket authentication'));
  }
};

/**
 * Shared visibility checks logic matching REST auth layers.
 */
const verifyComplaintAccess = (user, complaint) => {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'ENGINEER' || user.role === 'AGENT') {
    return complaint.assigned_to_id === user.id;
  }
  if (user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id) return true;
  if (user.role === 'CUSTOMER' && complaint.created_by_id === user.id) return true;
  return false;
};

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000'
];

const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : [];

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envAllowedOrigins]));

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (isDevelopment && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
};

/**
 * Initialize Socket.IO instance and register event handlers.
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: true
    }
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    // Join secure private user room for private notifications
    const userRoom = `user:${socket.user.id}`;
    socket.join(userRoom);

    // Complaint Room joining guard
    socket.on('join_complaint_room', async ({ complaintId }) => {
      if (!complaintId) return;

      try {
        const compRes = await dbPool.query('SELECT * FROM complaints WHERE id = $1', [complaintId]);
        if (compRes.rows.length === 0) {
          socket.emit('room_rejected', { complaintId, reason: 'Complaint not found' });
          return;
        }

        const complaint = compRes.rows[0];
        if (!verifyComplaintAccess(socket.user, complaint)) {
          logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { action: 'websocket_room_join', complaintId }, socket.user, socket.handshake.address);
          socket.emit('room_rejected', { complaintId, reason: 'Forbidden: Insufficient privileges' });
          return;
        }

        // Access authorized: join room
        const roomName = `complaint:${complaintId}`;
        socket.join(roomName);
        if (socket.user.role !== 'CUSTOMER') {
          socket.join(`${roomName}:staff`);
        }
        socket.emit('room_joined', { complaintId });
      } catch (err) {
        console.error('Error handling join_complaint_room socket event:', err.message);
        socket.emit('room_rejected', { complaintId, reason: 'Internal server error processing room join' });
      }
    });

    socket.on('leave_complaint_room', ({ complaintId }) => {
      if (!complaintId) return;
      const roomName = `complaint:${complaintId}`;
      socket.leave(roomName);
      socket.leave(`${roomName}:staff`);
    });
  });

  return io;
};

/**
 * Emit comment:created event to the targeted complaint room.
 */
const emitCommentCreated = (comment, userProfile) => {
  if (io && comment && comment.complaint_id) {
    const payload = {
      id: comment.id,
      complaint_id: comment.complaint_id,
      comment_text: comment.comment_text,
      is_internal: comment.is_internal,
      created_at: comment.created_at,
      first_name: userProfile.first_name,
      last_name: userProfile.last_name,
      role: userProfile.role
    };

    if (comment.is_internal) {
      io.to(`complaint:${comment.complaint_id}:staff`).emit('comment:created', payload);
    } else {
      io.to(`complaint:${comment.complaint_id}`).emit('comment:created', payload);
    }
  }
};

/**
 * Emit notification:new event to the targeted user's secure private room.
 */
const emitNotificationNew = (userId, notification) => {
  if (io && userId && notification) {
    io.to(`user:${userId}`).emit('notification:new', notification);
  }
};

module.exports = {
  initSocket,
  emitCommentCreated,
  emitNotificationNew
};
