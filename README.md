# PINakee Complaint Management System

This is the official Complaint Management System for PINACKEE TECH SOLUTIONS LLP.

## Current Project Status

- **Initial Project Setup**: Boilerplate frontend and backend environments configured, ready for database schema definition and feature implementation. No business features are implemented in this milestone.

## Project Structure

```
Pinakee-Complaint-System/
├── frontend/    # React (Vite) client application
├── backend/     # Node.js + Express backend server
└── docs/        # Documentation folder
```

## Architecture & Technology Stack

- **Frontend**: React (JavaScript, Vite)
- **Backend**: Node.js, Express.js (REST API)
- **Database**: PostgreSQL (pg client pool prepared)

## Getting Started

### Backend Setup

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the `.env.example` to `.env` and fill in your local configuration details (database credentials, port, etc.):
   ```bash
   copy .env.example .env
   ```
4. Start the backend server:
   - For production / standard start:
     ```bash
     npm start
     ```
   - For development (with auto-reload):
     ```bash
     npm run dev
     ```

The backend API will be available at `http://localhost:5000` (or your configured `PORT`). You can verify it is running by checking the health endpoint: `GET http://localhost:5000/api/health`.

### Frontend Setup

1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```

The frontend will be running locally, typically at `http://localhost:5173`.
