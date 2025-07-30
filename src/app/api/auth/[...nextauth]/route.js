// src\app\api\auth\[...nextauth]\route.js
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import bcrypt from 'bcryptjs';

export const authOptions = {
  session: {
    strategy: 'jwt', // Changed from database to JWT for simpler setup
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        action: { label: 'Action', type: 'text' }, // 'login' or 'signup'
        emailOrUsername: { 
          label: 'Email or Username', 
          type: 'text',
          placeholder: 'Enter your email or username'
        },
        email: {
          label: 'Email',
          type: 'email',
          placeholder: 'Enter your email'
        },
        username: {
          label: 'Username',
          type: 'text',
          placeholder: 'Choose a username'
        },
        password: { 
          label: 'Password', 
          type: 'password',
          placeholder: 'Enter your password'
        }
      },
      async authorize(credentials) {
        if (!credentials) return null;

        try {
          await connectDB();
          
          if (credentials.action === 'signup') {
            return await handleSignup(credentials);
          } else {
            return await handleLogin(credentials);
          }
        } catch (error) {
          console.error('Auth error:', error);
          // Return null with error message for better error handling
          throw new Error(error.message || 'Authentication failed');
        }
      }
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // Persist user data in JWT token
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.email = user.email;
      }
      return token;
    },

    async session({ session, token }) {
      // Send properties to the client
      if (token) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.email = token.email;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }
      // Allows callback URLs on the same origin
      if (new URL(url).origin === baseUrl) {
        return url;
      }
      return baseUrl;
    },

    async signIn({ user, account, profile, email, credentials }) {
      // Allow sign in if user exists
      return !!user;
    }
  },

  pages: {
    signIn: '/login',
    error: '/login',
    // Removed other OAuth-related pages
  },

  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log('User signed in:', user.email);
    },
    async signOut({ session, token }) {
      console.log('User signed out');
    }
  },

  debug: process.env.NODE_ENV === 'development',
  
  // Removed MongoDB adapter and Google OAuth specific configs
  secret: process.env.NEXTAUTH_SECRET,
};

// Handle user signup
async function handleSignup(credentials) {
  const { email, username, password } = credentials;
  
  // Validate required fields
  if (!email?.trim() || !username?.trim() || !password?.trim()) {
    throw new Error('All fields are required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    throw new Error('Invalid email format');
  }

  // Validate username (alphanumeric and underscore, 3-20 characters)
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username.trim())) {
    throw new Error('Username must be 3-20 characters and contain only letters, numbers, and underscores');
  }

  // Validate password (minimum 6 characters)
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim().toLowerCase();

  // Check if email already exists
  const existingEmailUser = await User.findOne({ email: cleanEmail });
  if (existingEmailUser) {
    throw new Error('Email already registered');
  }

  // Check if username already exists
  const existingUsernameUser = await User.findOne({ username: cleanUsername });
  if (existingUsernameUser) {
    throw new Error('Username already taken');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create new user
  const newUser = await User.create({
    email: cleanEmail,
    username: cleanUsername,
    password: hashedPassword,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return {
    id: newUser._id.toString(),
    email: newUser.email,
    username: newUser.username,
    name: newUser.username // For compatibility with NextAuth
  };
}

// Handle user login
async function handleLogin(credentials) {
  const { emailOrUsername, password } = credentials;
  
  if (!emailOrUsername?.trim() || !password?.trim()) {
    throw new Error('Email/username and password are required');
  }

  const cleanInput = emailOrUsername.trim().toLowerCase();
  
  // Find user by email or username
  const user = await User.findOne({
    $or: [
      { email: cleanInput },
      { username: cleanInput }
    ]
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  // Update last login time
  user.lastLogin = new Date();
  await user.save();

  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    name: user.username // For compatibility with NextAuth
  };
}

// Export handlers for Next.js App Router
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };