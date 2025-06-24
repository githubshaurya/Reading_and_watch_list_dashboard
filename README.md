### Features
# Browser Extension
Content Analysis - Analyze web page content in real-time

User Authentication - Secure login integration with the main platform

Content Synchronization - Sync analyzed content with user account

Settings Management - Customizable extension preferences

Popup Interface - Quick access to extension features

# Web Platform
User Management - Registration, authentication, and profile management

Content Sharing - Create, share, and discover quality content

Social Features - Follow/unfollow users, like content, comment system

Extension Integration - Seamless connection with browser extension

Search & Discovery - Find users and content across the platform

### Technology Stack

# Frontend
Next.js - React framework for the web application

React - Component-based UI library

# Backend
Next.js API Routes - Server-side API endpoints

NextAuth.js - Authentication system

MongoDB - Database for user and content storage

# Browser Extension
Manifest V3 - Modern extension architecture

Content Scripts - Web page interaction

Background Scripts - Service worker functionality


### API Endpoints
# Authentication
POST /api/auth - User authentication

POST /api/auth/complete-profile - Complete user profile setup

# Content Management
GET/POST /api/content - Retrieve/create content

GET /api/content/user/[username] - Get user-specific content

# Extension Integration
POST /api/extension/analyze - Analyze web content

GET/POST /api/extension/auth - Extension authentication

GET/POST /api/extension/content - Extension content management

POST /api/extension/sync - Sync extension data

# Social Features
POST /api/follow - Follow/unfollow users

GET /api/follow/followers/[userId] - Get user followers

GET /api/follow/following/[userId] - Get users being followed

POST /api/comments - Manage comments

# User Management
GET/PUT /api/profile/[username] - User profile operations

PUT /api/user/avatar - Update user avatar

GET /api/user/settings - User settings management

### Database Models
User - User account information and preferences

ContentItem - Shared content and metadata

Comment - User comments on content

CommentLike - Likes on comments

Follow - User follow relationships

Like - Content likes and reactions


### Installation & Setup Instructions
# Prerequisites
<>
-Next.js
- npm
- MongoDB Atlas account or local MongoDB instance
- Chrome
</>

git clone [<repository-url>](https://github.com/githubshaurya/gdsc_23113139/new/main?filename=README.md)
cd web_ext

npm install

# Create a .env.local file in the root directory:
 Database Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/webext_db
MONGODB_DB_NAME=webext_db

# Authentication
NEXTAUTH_SECRET=your-super-secret-key-min-32-characters
NEXTAUTH_URL=http://localhost:3000

# OAuth Providers (Optional but recommended)
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
