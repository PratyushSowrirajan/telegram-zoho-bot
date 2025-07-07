const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const BOT_TOKEN = "7803103960:AAHfeyMoir-bUGTO7LldOEHUf-DLnW46pMA";

// Replace these with your Zoho self-client credentials
const CLIENT_ID = "1000.JI4ZZ7HWHHGSHC5900OK5WLR1HPK5C";
const CLIENT_SECRET = "b74c2cc9967ccc98a2e32ee7044ec62ae0d410bd4d";
let REFRESH_TOKEN = "1000.e2dc155a132551b951b7d2ba0116c621.585a235fe65c43cd21ea759c22020bd9";
let ACCESS_TOKEN = "1000.79004b7706b87a1115f60b2340a2127a.c4ca5846653f928b39670f2e94223278";
let tokenExpiry = Date.now() + 3600 * 1000; // 1 hour from now

async function refreshAccessTokenIfNeeded() {
  // Force refresh if token is expired or invalid
  const needsRefresh = Date.now() >= tokenExpiry;
  
  console.log("🔄 Token refresh check:");
  console.log("  Current time:", new Date().toISOString());
  console.log("  Token expiry:", new Date(tokenExpiry).toISOString());
  console.log("  Needs refresh:", needsRefresh);
  
  if (needsRefresh) {
    try {
      console.log("🔄 Refreshing access token...");
      console.log("🔑 Using refresh token:", REFRESH_TOKEN.substring(0, 20) + "...");
      
      const response = await axios.post("https://accounts.zoho.com/oauth/v2/token", null, {
        params: {
          refresh_token: REFRESH_TOKEN,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "refresh_token"
        }
      });

      if (response.data.access_token) {
        ACCESS_TOKEN = response.data.access_token;
        tokenExpiry = Date.now() + 3600 * 1000; // reset expiry time
        console.log("✅ Access token refreshed successfully");
        console.log("🔑 New token:", ACCESS_TOKEN.substring(0, 20) + "...");
        console.log("⏰ New expiry:", new Date(tokenExpiry).toISOString());
      } else {
        console.error("❌ No access_token in refresh response:", response.data);
      }
    } catch (err) {
      console.error("❌ Error refreshing access token:");
      console.error("  Status:", err.response?.status);
      console.error("  Error data:", err.response?.data);
      console.error("  Error message:", err.message);
      throw err; // Re-throw to handle in calling function
    }
  }
}

// Force refresh token on startup since current one seems invalid
async function forceRefreshToken() {
  try {
    console.log("🔄 Force refreshing token on startup...");
    const response = await axios.post("https://accounts.zoho.com/oauth/v2/token", null, {
      params: {
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token"
      }
    });

    if (response.data.access_token) {
      ACCESS_TOKEN = response.data.access_token;
      tokenExpiry = Date.now() + 3600 * 1000;
      console.log("✅ Token force-refreshed on startup");
      console.log("🔑 New token:", ACCESS_TOKEN.substring(0, 20) + "...");
    }
  } catch (err) {
    console.error("❌ Failed to force refresh token:", err.response?.data || err.message);
  }
}

app.get("/", (req, res) => {
  res.send("✅ Webhook server is running");
});

// Add webhook setup endpoint
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

// Add webhook info endpoint
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

// Add test endpoint for Zoho API
app.get("/test-zoho", async (req, res) => {
  try {
    console.log("🧪 Testing Zoho API connection...");
    
    // Force refresh token first
    await forceRefreshToken();
    
    console.log("🔑 Access token:", ACCESS_TOKEN.substring(0, 20) + "...");
    console.log("⏰ Token expiry:", new Date(tokenExpiry).toISOString());
    
    const response = await axios.get(
      "https://www.zohoapis.com/crm/v2/Leads?per_page=1",
      {
        headers: { Authorization: `Zoho-oauthtoken ${ACCESS_TOKEN}` }
      }
    );
    
    res.json({
      success: true,
      message: "✅ Zoho API connection successful!",
      leads_count: response.data.data?.length || 0,
      token_status: "Valid",
      response_data: response.data
    });
  } catch (error) {
    console.error("❌ Zoho API Test Error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "❌ Zoho API connection failed",
      error_status: error.response?.status,
      error_message: error.message,
      error_data: error.response?.data,
      token_used: ACCESS_TOKEN.substring(0, 20) + "..."
    });
  }
});

app.post("/telegram-webhook", async (req, res) => {
  console.log("📨 Received webhook:", JSON.stringify(req.body, null, 2));
  
  const message = req.body.message;
  
  if (!message) {
    console.log("⚠️ No message in webhook data");
    return res.send("No message");
  }
  
  const chatId = message.chat.id;
  const text = message.text;
  
  console.log(`📱 Message from ${chatId}: ${text}`);

  if (text === "/leads") {
    try {
      console.log("🔍 Fetching leads from Zoho CRM...");
      
      // First attempt with current token
      await refreshAccessTokenIfNeeded();
      console.log("🔑 Using access token:", ACCESS_TOKEN.substring(0, 20) + "...");
      console.log("⏰ Token expiry:", new Date(tokenExpiry).toISOString());
      
      let response;
      try {
        response = await axios.get(
          "https://www.zohoapis.com/crm/v2/Leads?sort_by=Created_Time&sort_order=desc&per_page=5",
          {
            headers: { Authorization: `Zoho-oauthtoken ${ACCESS_TOKEN}` }
          }
        );
      } catch (firstAttemptError) {
        // If 401, force refresh and try again
        if (firstAttemptError.response?.status === 401) {
          console.log("🔄 First attempt failed with 401, force refreshing token...");
          await forceRefreshToken();
          
          console.log("🔄 Retrying with new token:", ACCESS_TOKEN.substring(0, 20) + "...");
          response = await axios.get(
            "https://www.zohoapis.com/crm/v2/Leads?sort_by=Created_Time&sort_order=desc&per_page=5",
            {
              headers: { Authorization: `Zoho-oauthtoken ${ACCESS_TOKEN}` }
            }
          );
        } else {
          throw firstAttemptError;
        }
      }

      const leads = response.data.data;
      let reply = "📋 *Latest Leads:*\n\n";

      if (!leads || leads.length === 0) {
        reply = "📋 No leads found in your CRM.";
      } else {
        leads.forEach((lead, i) => {
          reply += `${i + 1}. 👤 ${lead.First_Name || ""} ${lead.Last_Name || ""} | 📞 ${lead.Phone || "-"} | ✉️ ${lead.Email || "-"} | 🏢 ${lead.Company || "-"}\n`;
        });
      }

      console.log("📤 Sending reply to Telegram...");
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: reply,
        parse_mode: "Markdown"
      });

      console.log("✅ Message sent successfully");
      res.send("Message sent");
    } catch (e) {
      console.error("❌ CRM Fetch Error Details:");
      console.error("Status:", e.response?.status);
      console.error("Status Text:", e.response?.statusText);
      console.error("Error Data:", JSON.stringify(e.response?.data, null, 2));
      console.error("Error Message:", e.message);
      console.error("Full Error:", e);
      
      // Send error message to user with more details
      let errorMessage = "❌ Sorry, there was an error fetching leads. ";
      
      if (e.response?.status === 401) {
        errorMessage += "Authentication failed. The access token may be expired or invalid.";
      } else if (e.response?.status === 403) {
        errorMessage += "Access denied. Please check your Zoho CRM permissions.";
      } else if (e.response?.status === 404) {
        errorMessage += "Leads module not found. Please check your Zoho CRM setup.";
      } else {
        errorMessage += "Please try again later.";
      }
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: errorMessage
      });
      
      res.status(500).send("Error fetching leads");
    }
  } else if (text === "/start") {
    const welcomeMessage = "👋 Welcome to the Zoho CRM Bot!\n\nUse /leads to get the latest leads from your CRM.";
    
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: welcomeMessage
    });
    
    res.send("Welcome message sent");
  } else {
    // Send help message for unknown commands
    const helpMessage = "❓ Unknown command. Use /leads to get the latest leads from your CRM.";
    
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: helpMessage
    });
    
    res.send("Help message sent");
  }
});

app.listen(3000, async () => {
  console.log("🚀 Webhook running on port 3000");
  
  // Force refresh token on startup since current one seems invalid
  await forceRefreshToken();
});
