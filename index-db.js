const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const app = express();

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

const BOT_TOKEN = "7803103960:AAHfeyMoir-bUGTO7LldOEHUf-DLnW46pMA";

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database
async function initDatabase() {
  try {
    const client = await pool.connect();
    
    // Create users table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS telegram_users (
        id SERIAL PRIMARY KEY,
        telegram_chat_id BIGINT UNIQUE NOT NULL,
        client_id VARCHAR(255) NOT NULL,
        client_secret VARCHAR(255) NOT NULL,
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        crm_domain VARCHAR(255) DEFAULT 'https://www.zohoapis.com',
        token_expiry TIMESTAMP DEFAULT NOW() + INTERVAL '1 hour',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log("✅ Database initialized successfully");
    client.release();
  } catch (err) {
    console.error("❌ Database initialization failed:", err);
    throw err;
  }
}

// Database helper functions
async function getUserCredentials(chatId) {
  try {
    const result = await pool.query(
      'SELECT * FROM telegram_users WHERE telegram_chat_id = $1',
      [chatId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error("❌ Error fetching user credentials:", err);
    return null;
  }
}

async function saveUserCredentials(userData) {
  try {
    const result = await pool.query(
      `INSERT INTO telegram_users (telegram_chat_id, client_id, client_secret, refresh_token, access_token, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (telegram_chat_id) 
       DO UPDATE SET 
         client_id = EXCLUDED.client_id,
         client_secret = EXCLUDED.client_secret,
         refresh_token = EXCLUDED.refresh_token,
         access_token = EXCLUDED.access_token,
         updated_at = NOW()
       RETURNING *`,
      [userData.telegram_chat_id, userData.client_id, userData.client_secret, userData.refresh_token, userData.access_token]
    );
    return result.rows[0];
  } catch (err) {
    console.error("❌ Error saving user credentials:", err);
    throw err;
  }
}

async function updateUserToken(chatId, newAccessToken, expiryTime) {
  try {
    await pool.query(
      'UPDATE telegram_users SET access_token = $1, token_expiry = $2, updated_at = NOW() WHERE telegram_chat_id = $3',
      [newAccessToken, expiryTime, chatId]
    );
  } catch (err) {
    console.error("❌ Error updating user token:", err);
  }
}

// Token refresh function for specific user
async function refreshUserToken(user) {
  try {
    console.log(`🔄 Refreshing token for user ${user.telegram_chat_id}...`);
    
    const response = await axios.post("https://accounts.zoho.com/oauth/v2/token", null, {
      params: {
        refresh_token: user.refresh_token,
        client_id: user.client_id,
        client_secret: user.client_secret,
        grant_type: "refresh_token"
      }
    });

    if (response.data.access_token) {
      const newAccessToken = response.data.access_token;
      const expiryTime = new Date(Date.now() + 3600 * 1000); // 1 hour from now
      
      await updateUserToken(user.telegram_chat_id, newAccessToken, expiryTime);
      
      console.log(`✅ Token refreshed for user ${user.telegram_chat_id}`);
      return newAccessToken;
    } else {
      throw new Error("No access_token in refresh response");
    }
  } catch (err) {
    console.error(`❌ Token refresh failed for user ${user.telegram_chat_id}:`, err.response?.data || err.message);
    throw err;
  }
}

// Routes
app.get("/", (req, res) => {
  res.send("✅ Telegram Bot Server with Database is running");
});

// User registration endpoint (called by widget)
app.post("/register-user", async (req, res) => {
  try {
    const { telegram_chat_id, client_id, client_secret, access_token, refresh_token } = req.body;
    
    console.log(`📝 Registering user with chat ID: ${telegram_chat_id}`);
    
    // Validate required fields
    if (!telegram_chat_id || !client_id || !client_secret || !access_token || !refresh_token) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: telegram_chat_id, client_id, client_secret, access_token, refresh_token"
      });
    }
    
    // Validate chat ID is a number
    if (isNaN(telegram_chat_id)) {
      return res.status(400).json({
        success: false,
        message: "telegram_chat_id must be a valid number"
      });
    }
    
    // Save user credentials
    const userData = {
      telegram_chat_id: parseInt(telegram_chat_id),
      client_id,
      client_secret,
      access_token,
      refresh_token
    };
    
    const savedUser = await saveUserCredentials(userData);
    
    console.log(`✅ User registered successfully: ${telegram_chat_id}`);
    
    res.json({
      success: true,
      message: "User registered successfully! You can now use the Telegram bot.",
      user_id: savedUser.id,
      registered_at: savedUser.created_at
    });
    
  } catch (err) {
    console.error("❌ User registration failed:", err);
    res.status(500).json({
      success: false,
      message: "Registration failed: " + err.message
    });
  }
});

// Get user info endpoint
app.get("/user-info/:chatId", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const user = await getUserCredentials(chatId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        telegram_chat_id: user.telegram_chat_id,
        registered_at: user.created_at,
        last_updated: user.updated_at,
        has_credentials: !!(user.client_id && user.client_secret && user.refresh_token)
      }
    });
  } catch (err) {
    console.error("❌ Error fetching user info:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user info"
    });
  }
});

// Webhook setup endpoint
app.get("/setup-webhook", async (req, res) => {
  try {
    const webhookUrl = "https://telegram-zoho-bot.onrender.com/telegram-webhook";
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      url: webhookUrl
    });
    
    if (response.data.ok) {
      res.json({
        success: true,
        message: "✅ Webhook set up successfully!",
        webhook_url: webhookUrl
      });
    } else {
      res.status(400).json({
        success: false,
        message: "❌ Failed to set up webhook",
        error: response.data
      });
    }
  } catch (error) {
    console.error("❌ Webhook setup error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "❌ Error setting up webhook",
      error: error.message
    });
  }
});

// Webhook info endpoint
app.get("/webhook-info", async (req, res) => {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    res.json(response.data);
  } catch (error) {
    console.error("❌ Webhook info error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "❌ Error getting webhook info",
      error: error.message
    });
  }
});

// Main telegram webhook handler
app.post("/telegram-webhook", async (req, res) => {
  try {
    console.log("📨 Received webhook:", JSON.stringify(req.body, null, 2));
    
    const message = req.body.message;
    
    if (!message) {
      console.log("⚠️ No message in webhook data");
      return res.send("No message");
    }
    
    const chatId = message.chat.id;
    const text = message.text;
    
    console.log(`📱 Message from ${chatId}: ${text}`);
    
    // Get user credentials from database
    const user = await getUserCredentials(chatId);
    
    if (!user) {
      console.log(`❌ User ${chatId} not found in database`);
      await sendTelegramMessage(chatId, 
        "❌ You're not registered yet!\n\n" +
        "Please use the Telegram Connector widget in your Zoho CRM to register first.\n\n" +
        "📋 Steps:\n" +
        "1. Go to your Zoho CRM\n" +
        "2. Open Telegram Credentials module\n" +
        "3. Fill in your credentials\n" +
        "4. Click 'Connect to Telegram Bot' button"
      );
      return res.send("User not registered");
    }
    
    console.log(`✅ User ${chatId} found in database`);
    
    if (text === "/start") {
      const welcomeMessage = 
        "👋 Welcome to your Personal Zoho CRM Bot!\n\n" +
        "🎉 You're successfully connected!\n\n" +
        "📋 Available commands:\n" +
        "/leads - Get your latest CRM leads\n" +
        "/help - Show this help message\n\n" +
        "Your CRM data is private and secure! 🔒";
      
      await sendTelegramMessage(chatId, welcomeMessage);
      return res.send("Welcome message sent");
    }
    
    if (text === "/leads") {
      await handleLeadsCommand(chatId, user);
      return res.send("Leads command processed");
    }
    
    if (text === "/help") {
      const helpMessage = 
        "🤖 Zoho CRM Telegram Bot Help\n\n" +
        "📋 Available commands:\n" +
        "/start - Welcome message\n" +
        "/leads - Get your latest CRM leads\n" +
        "/help - Show this help message\n\n" +
        "💡 Tips:\n" +
        "• All data is fetched from YOUR CRM\n" +
        "• Your credentials are stored securely\n" +
        "• Only you can see your data\n\n" +
        "Need help? Contact your CRM administrator.";
      
      await sendTelegramMessage(chatId, helpMessage);
      return res.send("Help message sent");
    }
    
    // Unknown command
    await sendTelegramMessage(chatId, 
      "❓ Unknown command!\n\n" +
      "📋 Available commands:\n" +
      "/start - Welcome message\n" +
      "/leads - Get your latest CRM leads\n" +
      "/help - Show help\n\n" +
      "Type /help for more information."
    );
    
    res.send("Unknown command handled");
    
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).send("Webhook error");
  }
});

// Handle leads command
async function handleLeadsCommand(chatId, user) {
  try {
    console.log(`🔍 Fetching leads for user ${chatId}...`);
    
    let accessToken = user.access_token;
    
    // Check if token needs refresh
    const now = new Date();
    const tokenExpiry = new Date(user.token_expiry);
    
    if (now >= tokenExpiry) {
      console.log(`🔄 Token expired for user ${chatId}, refreshing...`);
      accessToken = await refreshUserToken(user);
    }
    
    // Fetch leads from user's CRM
    let response;
    try {
      response = await axios.get(
        "https://www.zohoapis.com/crm/v2/Leads?sort_by=Created_Time&sort_order=desc&per_page=5",
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        }
      );
    } catch (firstAttemptError) {
      // If 401, try refreshing token
      if (firstAttemptError.response?.status === 401) {
        console.log(`🔄 First attempt failed with 401 for user ${chatId}, refreshing token...`);
        accessToken = await refreshUserToken(user);
        
        response = await axios.get(
          "https://www.zohoapis.com/crm/v2/Leads?sort_by=Created_Time&sort_order=desc&per_page=5",
          {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
          }
        );
      } else {
        throw firstAttemptError;
      }
    }
    
    const leads = response.data.data;
    let reply = "📋 *Your Latest Leads:*\n\n";
    
    if (!leads || leads.length === 0) {
      reply = "📋 No leads found in your CRM.\n\n💡 Try creating some leads first!";
    } else {
      leads.forEach((lead, i) => {
        const firstName = lead.First_Name || "";
        const lastName = lead.Last_Name || "";
        const phone = lead.Phone || "-";
        const email = lead.Email || "-";
        const company = lead.Company || "-";
        
        reply += `${i + 1}. 👤 ${firstName} ${lastName}\n`;
        reply += `   📞 ${phone}\n`;
        reply += `   ✉️ ${email}\n`;
        reply += `   🏢 ${company}\n\n`;
      });
    }
    
    await sendTelegramMessage(chatId, reply);
    console.log(`✅ Leads sent successfully to user ${chatId}`);
    
  } catch (error) {
    console.error(`❌ Error fetching leads for user ${chatId}:`, error);
    
    let errorMessage = "❌ Sorry, there was an error fetching your leads.\n\n";
    
    if (error.response?.status === 401) {
      errorMessage += "🔑 Authentication failed. Your access token may be invalid.\n\nPlease re-register using the CRM widget.";
    } else if (error.response?.status === 403) {
      errorMessage += "🚫 Access denied. Please check your CRM permissions.";
    } else if (error.response?.status === 404) {
      errorMessage += "❓ Leads module not found. Please check your CRM setup.";
    } else {
      errorMessage += "🔄 Please try again later or contact support.";
    }
    
    await sendTelegramMessage(chatId, errorMessage);
  }
}

// Send telegram message helper
async function sendTelegramMessage(chatId, text) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown"
    });
  } catch (error) {
    console.error("❌ Error sending telegram message:", error.response?.data || error.message);
  }
}

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  try {
    await initDatabase();
    console.log("✅ Server started successfully with database connection");
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
});
