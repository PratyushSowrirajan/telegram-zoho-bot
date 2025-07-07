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

app.post("/telegram-webhook", async (req, res) => {
  const message = req.body.message;
  const chatId = message.chat.id;
  const text = message.text;

  if (text === "/leads") {
    await refreshAccessTokenIfNeeded();

    try {
      const response = await axios.get(
        "https://www.zohoapis.com/crm/v2/Leads?sort_by=Created_Time&sort_order=desc&per_page=5",
        {
          headers: { Authorization: `Zoho-oauthtoken ${ACCESS_TOKEN}` }
        }
      );

      const leads = response.data.data;
      let reply = "📋 *Latest Leads:*\n\n";

      leads.forEach((lead, i) => {
        reply += `${i + 1}. 👤 ${lead.First_Name || ""} ${lead.Last_Name || ""} | 📞 ${lead.Phone || "-"} | ✉️ ${lead.Email || "-"} | 🏢 ${lead.Company || "-"}\n`;
      });

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: reply,
        parse_mode: "Markdown"
      });

      res.send("Message sent");
    } catch (e) {
      console.error("❌ CRM Fetch Error:", e.response?.data || e.message);
      res.status(500).send("Error fetching leads");
    }
  } else {
    res.send("Unknown command");
  }
});

app.listen(3000, () => console.log("🚀 Webhook running on port 3000"));
