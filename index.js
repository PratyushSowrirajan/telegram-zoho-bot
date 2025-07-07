const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const BOT_TOKEN = "7803103960:AAHfeyMoir-bUGTO7LldOEHUf-DLnW46pMA";

// Replace these with your Zoho self-client credentials
const CLIENT_ID = "1000.JI4ZZ7HWHHGSHC5900OK5WLR1HPK5C";
const CLIENT_SECRET = "b74c2cc9967ccc98a2e32ee7044ec62ae0d410bd4d";
let REFRESH_TOKEN = "1000.faa21c19a8d6c3d9cb52c5e81a5ad496.73140e414fab5a40fa6cfc55f2d657c9";
let ACCESS_TOKEN = "1000.b7393374c051c4728769898355e0dc46.e1131ece96dd50f6d4051ded5d7c6a9e";
let tokenExpiry = Date.now() + 3600 * 1000; // 1 hour from now

async function refreshAccessTokenIfNeeded() {
  if (Date.now() >= tokenExpiry) {
    try {
      const response = await axios.post("https://accounts.zoho.com/oauth/v2/token", null, {
        params: {
          refresh_token: REFRESH_TOKEN,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "refresh_token"
        }
      });

      ACCESS_TOKEN = response.data.access_token;
      tokenExpiry = Date.now() + 3600 * 1000; // reset expiry time
      console.log("✅ Access token refreshed.");
    } catch (err) {
      console.error("❌ Error refreshing access token:", err.response?.data || err.message);
    }
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
    await refreshAccessTokenIfNeeded();
    
    console.log("🧪 Testing Zoho API connection...");
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
    await refreshAccessTokenIfNeeded();

    try {
      console.log("🔍 Fetching leads from Zoho CRM...");
      console.log("🔑 Using access token:", ACCESS_TOKEN.substring(0, 20) + "...");
      console.log("⏰ Token expiry:", new Date(tokenExpiry).toISOString());
      
      const response = await axios.get(
        "https://www.zohoapis.com/crm/v2/Leads?sort_by=Created_Time&sort_order=desc&per_page=5",
        {
          headers: { Authorization: `Zoho-oauthtoken ${ACCESS_TOKEN}` }
        }
      );

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

app.listen(3000, () => console.log("🚀 Webhook running on port 3000"));
