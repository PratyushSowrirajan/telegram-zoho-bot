# Testing the Telegram Bot Widget

## Quick Test Checklist

### 1. Backend Server Test
Test if your backend server is running:
```
https://telegram-zoho-bot.onrender.com/
```
You should see: "✅ Telegram Bot Server with Database is running"

### 2. Widget Test
1. Open the widget in your Zoho CRM custom module
2. Check browser console (F12) for any error messages
3. Click "Connect to Telegram Bot" button
4. Watch for status messages and console logs

### 3. Database Connection Test
Test the user registration endpoint:
```
POST https://telegram-zoho-bot.onrender.com/register-user
```
With test data:
```json
{
  "telegram_chat_id": 123456789,
  "client_id": "test_client_id",
  "client_secret": "test_client_secret",
  "access_token": "test_access_token",
  "refresh_token": "test_refresh_token"
}
```

### 4. Telegram Bot Test
1. Message your bot in Telegram
2. Use `/leads` command
3. Check if it fetches leads from your CRM

## Common Issues

### Widget Not Loading
- Check if all SDK scripts are loaded
- Verify ZOHO object is available in browser console
- Check browser console for JavaScript errors

### Registration Failing
- Verify all required fields are filled in the CRM record
- Check that Telegram Chat ID is a valid number
- Verify backend URL is correct

### Database Connection Issues
- Check DATABASE_URL environment variable on Render
- Verify PostgreSQL database is accessible
- Check server logs on Render dashboard

## Environment Variables on Render

Make sure these are set in your Render dashboard:

1. `DATABASE_URL` - Your PostgreSQL connection string (external URL)
2. `NODE_ENV` - Set to "production"
3. `PORT` - Usually auto-set by Render

## Getting Your Telegram Chat ID

1. Message @userinfobot on Telegram
2. It will reply with your chat ID
3. Use this number in your CRM record

## Next Steps

1. Deploy the updated code to Render
2. Test the widget in your CRM
3. Register a user via the widget
4. Test the `/leads` command in Telegram
