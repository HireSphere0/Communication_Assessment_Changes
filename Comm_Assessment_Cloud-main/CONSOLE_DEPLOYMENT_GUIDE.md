# Google Cloud Console Deployment Guide

Deploy your Communication Assessment Application using **only** the web interface - no command line needed!

## 🌐 What You'll Use

- **Google Cloud Console** (web interface)
- **Cloud Build** (automated building)  
- **Cloud Run** (serverless hosting)
- **Secret Manager** (secure environment variables)
- **MongoDB Atlas** (database)

## 📋 What You Need

1. Google account with Cloud Platform access
2. Credit card for billing (free $300 credit available)
3. MongoDB Atlas account (free tier available)
4. Your app files on GitHub

---

## 🚀 Step 1: Create Google Cloud Project

1. **Go to**: https://console.cloud.google.com/
2. **Click**: Project dropdown → "New Project"
3. **Enter**: Project name: `communication-assessment-app`
4. **Note**: Your Project ID (you'll need this)
5. **Click**: "Create"
6. **Enable billing**: Go to "Billing" → Link billing account

## 🔧 Step 2: Enable APIs

**Go to**: "APIs & Services" → "Library"

**Enable these APIs**:
- Cloud Build API
- Cloud Run API  
- Container Registry API
- Secret Manager API

## 💾 Step 3: Set Up MongoDB Atlas

1. **Go to**: https://cloud.mongodb.com/
2. **Create**: Free account/sign in
3. **Build Database**: Choose FREE tier (M0)
4. **Create user**: Username: `appuser`, generate secure password
5. **Network Access**: "Allow Access from Anywhere" (0.0.0.0/0)
6. **Get connection string**: 
   - Click "Connect" → "Connect your application"
   - Copy string: `mongodb+srv://appuser:PASSWORD@cluster.mongodb.net/communication-assessment`

## 🔐 Step 4: Create Secrets

**Go to**: "Security" → "Secret Manager"

**Create these secrets** (click "Create Secret" for each):

| Secret Name | Value |
|-------------|-------|
| `mongodb-uri` | Your MongoDB connection string |
| `session-secret` | Random 32+ character string |
| `openai-api-key` | Your OpenAI API key |
| `deepseek-api-key` | Your DeepSeek API key (optional) |
| `azure-speech-key` | Your Azure Speech key |
| `email-user` | Your Gmail address |
| `email-pass` | Your Gmail App Password* |

*Gmail App Password: Google Account → Security → 2-Step Verification → App Passwords

## 📤 Step 5: Upload Your Code

**Option A: GitHub (Recommended)**
1. Create GitHub repository
2. Upload all your files (including Docker files I created)
3. In Google Cloud: "Cloud Build" → "Triggers" → "Connect Repository" → "GitHub"

**Option B: Cloud Source Repositories**
1. "Cloud Source Repositories" → "Add Repository"
2. "Create new repository": `communication-assessment-app`
3. Upload files via web editor

## ⚙️ Step 6: Create Build Trigger

1. **Go to**: "Cloud Build" → "Triggers"
2. **Click**: "Create Trigger"
3. **Configure**:
   - Name: `deploy-communication-app`
   - Event: "Push to a branch"
   - Branch: `^main$`
   - Configuration: "Cloud Build configuration file"
   - Location: `cloudbuild.yaml`
4. **Click**: "Create"

## 🔑 Step 7: Set Permissions

1. **Go to**: "IAM & Admin" → "IAM"
2. **Find**: Service account ending with `@cloudbuild.gserviceaccount.com`
3. **Click**: Edit (pencil icon)
4. **Add roles**:
   - Cloud Run Admin
   - Secret Manager Secret Accessor
   - Service Account User
5. **Click**: "Save"

## 🚀 Step 8: Deploy

1. **Go to**: "Cloud Build" → "Triggers"
2. **Click**: "Run" on your trigger
3. **Monitor**: "Cloud Build" → "History" (takes 5-10 minutes)
4. **Check**: "Cloud Run" for your deployed service

## ✅ Step 9: Verify & Configure

1. **Go to**: "Cloud Run" → `communication-assessment-app`
2. **Get URL**: Copy the service URL
3. **Test**: Visit `YOUR_URL/api/health`
4. **Configure if needed**: 
   - Click "Edit & Deploy New Revision"
   - Verify secrets are connected
   - Set resources: 2GB RAM, 2 CPU
   - Set autoscaling: Min 1, Max 10 instances

## 🎯 Step 10: Test Everything

- Visit your application URL
- Create a test account
- Verify email works
- Test assessment features

---

## 🔧 Managing Your App

### View Logs
"Cloud Run" → Your service → "Logs" tab

### Update App  
Push changes to GitHub → Automatic deployment

### Monitor Performance
"Cloud Run" → Your service → "Metrics" tab

### Manage Secrets
"Secret Manager" → Click any secret to edit

---

## 💰 Monthly Costs

- **Cloud Run**: $5-15 (pay per use)
- **MongoDB Atlas**: Free or $9
- **Secret Manager**: $0.50
- **Total**: ~$6-25/month

---

## 🛠️ Troubleshooting

### Build Fails
1. "Cloud Build" → "History" → Click failed build
2. Check logs for errors
3. Common issues: Missing APIs, wrong permissions

### App Won't Start  
1. "Cloud Run" → Your service → "Logs"
2. Look for startup errors
3. Common issues: Database connection, missing secrets

### Database Issues
1. Check MongoDB Atlas network settings
2. Verify connection string in Secret Manager
3. Ensure database user has correct permissions

---

## 🔒 Security Checklist

- ✅ All secrets in Secret Manager (not in code)
- ✅ MongoDB Atlas network properly configured  
- ✅ IAM roles follow least privilege
- ✅ HTTPS enabled by default
- ✅ Regular secret rotation

---

## 🎉 You're Done!

Your app will be live at:
`https://communication-assessment-app-xxxxx-uc.a.run.app`

**Features you get:**
- ✅ Global HTTPS access
- ✅ Automatic scaling  
- ✅ 99.9% uptime
- ✅ Pay-per-use pricing
- ✅ Secure secret management

Share your URL and enjoy your deployed application! 🚀

---

## 📞 Need Help?

- **Google Cloud Docs**: https://cloud.google.com/docs
- **MongoDB Atlas Docs**: https://docs.atlas.mongodb.com/
- **Community Support**: Stack Overflow with `google-cloud-platform` tag