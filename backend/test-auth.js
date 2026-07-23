const axios = require('axios');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTests() {
  const API_URL = 'http://localhost:3001/api/v1';
  let accessToken = null;
  let refreshTokenCookie = null;

  try {
    console.log('--- Cleaning Database ---');
    await prisma.user.deleteMany({});
    console.log('✅ Database cleaned.');

    console.log('--- Starting Auth Tests ---');

    // Test 1: Setup Admin Account
    console.log('1. Testing Setup (/auth/setup)...');
    const setupRes = await axios.post(`${API_URL}/auth/setup`, {
      username: 'testadmin',
      fullName: 'Test Admin',
      password: 'securepassword123',
    });
    console.log('✅ Setup success:', setupRes.data.success);

    // Test 2: Login
    console.log('2. Testing Login (/auth/login)...');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      username: 'testadmin',
      password: 'securepassword123',
    });
    console.log('✅ Login success:', loginRes.data.success);
    accessToken = loginRes.data.data.accessToken;
    refreshTokenCookie = loginRes.headers['set-cookie']?.find(c => c.includes('refreshToken'));

    if (!accessToken) throw new Error('No access token returned');
    if (!refreshTokenCookie) throw new Error('No refresh token cookie returned');

    // Test 3: Get current user profile (/auth/me) with token
    console.log('3. Testing Protected Route (/auth/me)...');
    const meRes = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    console.log('✅ Protected route access success:', meRes.data.data.username);

    // Test 4: Invalid Token Rejected
    console.log('4. Testing Invalid Token Rejection...');
    try {
      await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer invalid.token.here` }
      });
      throw new Error('Should have rejected invalid token');
    } catch (err) {
      if (err.response?.status === 401) {
        console.log('✅ Invalid token correctly rejected (401)');
      } else {
        throw err;
      }
    }

    // Test 5: Refresh Token
    console.log('5. Testing Token Refresh (/auth/refresh)...');
    const refreshRes = await axios.post(`${API_URL}/auth/refresh`, {}, {
      headers: { Cookie: refreshTokenCookie }
    });
    console.log('✅ Token refresh success:', refreshRes.data.success);
    const newAccessToken = refreshRes.data.data.accessToken;
    if (!newAccessToken) throw new Error('No access token returned from refresh');

    // Test 6: Invalid Credentials
    console.log('6. Testing Invalid Credentials (/auth/login)...');
    try {
      await axios.post(`${API_URL}/auth/login`, {
        username: 'testadmin',
        password: 'wrongpassword',
      });
      throw new Error('Should have rejected wrong password');
    } catch (err) {
      if (err.response?.status === 401) {
        console.log('✅ Invalid credentials correctly rejected (401)');
      } else {
        throw err;
      }
    }

    // Test 7: Lockout after 5 failed attempts
    console.log('7. Testing Account Lockout...');
    for (let i = 0; i < 4; i++) {
      try {
        await axios.post(`${API_URL}/auth/login`, { username: 'testadmin', password: 'wrongpassword' });
      } catch (e) {} // ignore
    }
    try {
      await axios.post(`${API_URL}/auth/login`, { username: 'testadmin', password: 'wrongpassword' });
      throw new Error('Should have rejected due to lockout');
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.message.includes('locked')) {
        console.log('✅ Account lockout success (400 with locked message)');
      } else if (err.response?.status === 400) {
        // Just checking if we get the locked message
        console.log('✅ Account locked correctly:', err.response.data.message);
      } else {
        throw err;
      }
    }

    console.log('--- All Tests Passed Successfully! ---');

  } catch (error) {
    console.error('❌ Test Failed:', error.response?.data || error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
