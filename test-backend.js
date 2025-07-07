// Test script to verify backend functionality
// Run this in Node.js to test your backend endpoints

const axios = require('axios');

// Update this URL to match your actual Render deployment
const BASE_URL = 'https://telegram-zoho-bot.onrender.com';

async function testBackend() {
  console.log('🧪 Testing Telegram Bot Backend...\n');
  
  try {
    // Test 1: Basic connectivity
    console.log('1. Testing basic connectivity...');
    const response = await axios.get(BASE_URL);
    console.log('✅ Backend is running:', response.data);
    
    // Test 2: User registration
    console.log('\n2. Testing user registration...');
    const testUser = {
      telegram_chat_id: 123456789,
      client_id: 'test_client_id',
      client_secret: 'test_client_secret',
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token'
    };
    
    const regResponse = await axios.post(`${BASE_URL}/register-user`, testUser);
    console.log('✅ User registration:', regResponse.data);
    
    // Test 3: User info retrieval
    console.log('\n3. Testing user info retrieval...');
    const userInfo = await axios.get(`${BASE_URL}/user-info/${testUser.telegram_chat_id}`);
    console.log('✅ User info:', userInfo.data);
    
    console.log('\n🎉 All tests passed! Backend is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Backend might not be running. Check your Render deployment.');
    }
  }
}

// Run the test
testBackend();
