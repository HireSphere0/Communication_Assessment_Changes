# Google Cloud Deployment Guide

This guide will walk you through deploying your Communication Assessment Application to Google Cloud Platform using Cloud Run and Cloud Build.

## Prerequisites

1. **Google Cloud Account**: Ensure you have a Google Cloud account with billing enabled
2. **Google Cloud CLI**: Install the `gcloud` CLI tool on your local machine
3. **Docker**: Install Docker on your local machine (for local testing)
4. **MongoDB Atlas**: Set up a MongoDB Atlas cluster (recommended for production)

## Step 1: Set Up Google Cloud Project

### 1.1 Create a New Project
```bash
# Create a new project
gcloud projects create your-project-id --name="Communication Assessment App"

# Set the project as default
gcloud config set project your-project-id

# Enable billing (replace BILLING_ACCOUNT_ID with your billing account)
gcloud billing projects link your-project-id --billing-account=BILLING_ACCOUNT_ID
```

### 1.2 Enable Required APIs
```bash
# Enable necessary Google Cloud APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

## Step 2: Set Up MongoDB Database

### Option A: MongoDB Atlas (Recommended)
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Create a new cluster
3. Create a database user
4. Get your connection string (format: `mongodb+srv://username:password@cluster.mongodb.net/communication-assessment`)

### Option B: Google Cloud MongoDB
```bash
# Deploy MongoDB on Google Compute Engine or use Google Cloud Marketplace
# This is more complex and requires additional setup
```

## Step 3: Configure Environment Variables

### 3.1 Create Secrets in Google Secret Manager
```bash
# Create secrets for sensitive data
gcloud secrets create mongodb-uri --data-file=- <<< "mongodb+srv://username:password@cluster.mongodb.net/communication-assessment"
gcloud secrets create session-secret --data-file=- <<< "your-super-secure-session-secret-minimum-32-characters-long"
gcloud secrets create openai-api-key --data-file=- <<< "your-openai-api-key"
gcloud secrets create deepseek-api-key --data-file=- <<< "your-deepseek-api-key"
gcloud secrets create azure-speech-key --data-file=- <<< "your-azure-speech-key"
gcloud secrets create email-user --data-file=- <<< "your-email@gmail.com"
gcloud secrets create email-pass --data-file=- <<< "your-email-app-password"

# Verify secrets were created
gcloud secrets list
```

### 3.2 Grant Cloud Build Access to Secrets
```bash
# Get the Cloud Build service account email
PROJECT_NUMBER=$(gcloud projects describe your-project-id --format="value(projectNumber)")
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Grant access to secrets
gcloud secrets add-iam-policy-binding mongodb-uri --member="serviceAccount:${CLOUD_BUILD_SA}" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding session-secret --member="serviceAccount:${CLOUD_BUILD_SA}" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding openai-api-key --member="serviceAccount:${CLOUD_BUILD_SA}" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding deepseek-api-key --member="serviceAccount:${CLOUD_BUILD_SA}" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding azure-speech-key --member="serviceAccount:${CLOUD_BUILD_SA}" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding email-user --member="serviceAccount:${CLOUD_BUILD_SA}" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding email-pass --member="serviceAccount:${CLOUD_BUILD_SA}" --role="roles/secretmanager.secretAccessor"
```

## Step 4: Update Cloud Build Configuration

Edit `cloudbuild.yaml` to use secrets from Secret Manager:

```yaml
# Add this step before the deploy step
- name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
  entrypoint: 'bash'
  args:
    - '-c'
    - |
      # Access secrets and set as environment variables
      export MONGODB_URI=$$(gcloud secrets versions access latest --secret=mongodb-uri)
      export SESSION_SECRET=$$(gcloud secrets versions access latest --secret=session-secret)
      export OPENAI_API_KEY=$$(gcloud secrets versions access latest --secret=openai-api-key)
      export DEEPSEEK_API_KEY=$$(gcloud secrets versions access latest --secret=deepseek-api-key)
      export AZURE_SPEECH_KEY=$$(gcloud secrets versions access latest --secret=azure-speech-key)
      export EMAIL_USER=$$(gcloud secrets versions access latest --secret=email-user)
      export EMAIL_PASS=$$(gcloud secrets versions access latest --secret=email-pass)
  id: 'load-secrets'
```

## Step 5: Test Locally (Optional but Recommended)

### 5.1 Create Local Environment File
```bash
# Copy the Docker environment template
cp env.docker.template .env

# Edit .env with your actual values
nano .env
```

### 5.2 Run Locally with Docker Compose
```bash
# Build and start the application
docker-compose up --build

# Test the application
curl http://localhost:8080/api/health

# Stop the application
docker-compose down
```

## Step 6: Deploy to Google Cloud

### 6.1 Initialize Git Repository (if not already done)
```bash
git init
git add .
git commit -m "Initial commit for Google Cloud deployment"
```

### 6.2 Connect to Cloud Source Repositories (Optional)
```bash
# Create a repository in Cloud Source Repositories
gcloud source repos create communication-assessment-app

# Add the repository as a remote
git remote add google https://source.developers.google.com/p/your-project-id/r/communication-assessment-app

# Push your code
git push google main
```

### 6.3 Deploy Using Cloud Build

#### Option A: Manual Build and Deploy
```bash
# Submit build to Cloud Build
gcloud builds submit --config cloudbuild.yaml .

# Check build status
gcloud builds list --limit=5
```

#### Option B: Set Up Continuous Deployment
```bash
# Create a build trigger
gcloud builds triggers create github \
  --repo-name=your-github-repo \
  --repo-owner=your-github-username \
  --branch-pattern=main \
  --build-config=cloudbuild.yaml
```

## Step 7: Configure Cloud Run Service

### 7.1 Update Cloud Run with Secrets
```bash
# Update the Cloud Run service to use secrets
gcloud run services update communication-assessment-app \
  --region=us-central1 \
  --update-secrets=MONGODB_URI=mongodb-uri:latest \
  --update-secrets=SESSION_SECRET=session-secret:latest \
  --update-secrets=OPENAI_API_KEY=openai-api-key:latest \
  --update-secrets=DEEPSEEK_API_KEY=deepseek-api-key:latest \
  --update-secrets=AZURE_SPEECH_KEY=azure-speech-key:latest \
  --update-secrets=EMAIL_USER=email-user:latest \
  --update-secrets=EMAIL_PASS=email-pass:latest \
  --update-env-vars=AZURE_SPEECH_REGION=your-azure-region \
  --update-env-vars=EMAIL_HOST=smtp.gmail.com \
  --update-env-vars=EMAIL_PORT=587
```

### 7.2 Set Up Custom Domain (Optional)
```bash
# Map a custom domain to your Cloud Run service
gcloud run domain-mappings create \
  --service=communication-assessment-app \
  --domain=your-domain.com \
  --region=us-central1
```

## Step 8: Verify Deployment

### 8.1 Get Service URL
```bash
# Get the service URL
gcloud run services describe communication-assessment-app \
  --region=us-central1 \
  --format="value(status.url)"
```

### 8.2 Test the Deployed Application
```bash
# Test health endpoint
curl https://your-service-url/api/health

# Test the main page
curl https://your-service-url
```

## Step 9: Set Up Monitoring and Logging

### 9.1 Enable Cloud Monitoring
```bash
# Cloud Monitoring is enabled by default for Cloud Run
# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=communication-assessment-app" --limit=50 --format=table
```

### 9.2 Set Up Alerts
```bash
# Create an alert policy for high error rates
gcloud alpha monitoring policies create --policy-from-file=alert-policy.yaml
```

## Step 10: Security and Performance Optimization

### 10.1 Set Up IAM Roles
```bash
# Create a custom service account for the application
gcloud iam service-accounts create communication-app-sa \
  --display-name="Communication Assessment App Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:communication-app-sa@your-project-id.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 10.2 Configure Scaling
```bash
# Update Cloud Run service with scaling configuration
gcloud run services update communication-assessment-app \
  --region=us-central1 \
  --min-instances=1 \
  --max-instances=20 \
  --concurrency=100 \
  --cpu=2 \
  --memory=2Gi
```

## Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Check build logs
   gcloud builds log BUILD_ID
   ```

2. **Service Not Starting**
   ```bash
   # Check Cloud Run logs
   gcloud logs tail --service=communication-assessment-app
   ```

3. **Environment Variables Not Loading**
   ```bash
   # Verify secrets exist
   gcloud secrets list
   
   # Check secret versions
   gcloud secrets versions list SECRET_NAME
   ```

4. **Database Connection Issues**
   - Ensure MongoDB Atlas allows connections from `0.0.0.0/0` or specific Google Cloud IPs
   - Verify the connection string format
   - Check network access settings in MongoDB Atlas

### Useful Commands

```bash
# View service details
gcloud run services describe communication-assessment-app --region=us-central1

# Update environment variables
gcloud run services update communication-assessment-app \
  --region=us-central1 \
  --update-env-vars=KEY=VALUE

# View recent deployments
gcloud run revisions list --service=communication-assessment-app --region=us-central1

# Roll back to previous revision
gcloud run services update-traffic communication-assessment-app \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100
```

## Cost Optimization

1. **Use appropriate instance sizes**: Start with 1 CPU and 1GB RAM, scale as needed
2. **Set minimum instances**: Use `--min-instances=0` for development, `1+` for production
3. **Monitor usage**: Use Cloud Monitoring to track resource usage
4. **Use request-based pricing**: Cloud Run charges only for actual usage

## Security Best Practices

1. **Use Secret Manager**: Never hardcode sensitive data
2. **Enable HTTPS**: Cloud Run provides HTTPS by default
3. **Implement proper authentication**: Your app already has user authentication
4. **Regular updates**: Keep dependencies updated
5. **Monitor logs**: Set up log-based alerts for security events

## Maintenance

### Regular Tasks
1. **Update dependencies**: Run `npm audit` and update packages regularly
2. **Monitor performance**: Check Cloud Run metrics weekly
3. **Review logs**: Check for errors and unusual patterns
4. **Backup data**: Ensure MongoDB backups are configured
5. **Test deployments**: Use staging environments for testing

### Scaling Considerations
- Monitor CPU and memory usage
- Adjust concurrency settings based on workload
- Consider using Cloud CDN for static assets
- Implement caching strategies for better performance

---

## Quick Deployment Summary

For experienced users, here's the quick deployment process:

```bash
# 1. Set up project and enable APIs
gcloud projects create your-project-id
gcloud config set project your-project-id
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com secretmanager.googleapis.com

# 2. Create secrets
gcloud secrets create mongodb-uri --data-file=- <<< "your-mongodb-connection-string"
gcloud secrets create session-secret --data-file=- <<< "your-session-secret"
# ... (create all other secrets)

# 3. Deploy
gcloud builds submit --config cloudbuild.yaml .

# 4. Configure secrets in Cloud Run
gcloud run services update communication-assessment-app \
  --region=us-central1 \
  --update-secrets=MONGODB_URI=mongodb-uri:latest \
  --update-secrets=SESSION_SECRET=session-secret:latest
  # ... (add all other secrets)

# 5. Get service URL
gcloud run services describe communication-assessment-app --region=us-central1 --format="value(status.url)"
```

Your Communication Assessment Application is now deployed and ready to use on Google Cloud Platform!