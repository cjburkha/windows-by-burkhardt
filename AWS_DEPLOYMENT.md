# AWS Deployment Configuration for Windows by Burkhardt

This document provides instructions for deploying the Windows by Burkhardt application to AWS.

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI installed and configured
3. Docker installed locally
4. GitHub account with repository access

## AWS Services Used

- **Amazon ECR**: Container registry to store Docker images
- **AWS App Runner**: Managed container service for deployment
- **AWS SES**: Simple Email Service for sending emails

## Initial AWS Setup

### 1. Configure AWS SES

First, set up AWS SES to send emails:

```bash
# Verify your sender email address
aws ses verify-email-identity \
  --email-address noreply@yourdomain.com \
  --region us-east-1

# Verify the recipient email (required in sandbox mode)
aws ses verify-email-identity \
  --email-address chris.burkhardt@live.com \
  --region us-east-1
```

**Note**: AWS SES starts in sandbox mode. To send emails to any address, request production access in the AWS Console.

### 2. Create IAM User for SES

Create an IAM user with SES permissions:

```bash
# Create IAM user
aws iam create-user --user-name windows-burkhardt-ses

# Attach SES policy
aws iam attach-user-policy \
  --user-name windows-burkhardt-ses \
  --policy-arn arn:aws:iam::aws:policy/AmazonSESFullAccess

# Create access keys
aws iam create-access-key --user-name windows-burkhardt-ses
```

Save the `AccessKeyId` and `SecretAccessKey` from the output.

### 3. Create ECR Repository

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name windows-by-burkhardt \
  --region us-east-1
```

### 4. Create App Runner Service

```bash
# Create App Runner service
aws apprunner create-service \
  --service-name windows-by-burkhardt \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "<YOUR_ECR_REGISTRY>/windows-by-burkhardt:latest",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "NODE_ENV": "production",
          "AWS_REGION": "us-east-1"
        }
      },
      "ImageRepositoryType": "ECR"
    },
    "AutoDeploymentsEnabled": false,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "<YOUR_APP_RUNNER_ECR_ACCESS_ROLE_ARN>"
    }
  }' \
  --instance-configuration '{
    "Cpu": "1 vCPU",
    "Memory": "2 GB"
  }' \
  --health-check-configuration '{
    "Protocol": "HTTP",
    "Path": "/health",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }' \
  --region us-east-1
```

## GitHub Secrets Configuration

Add the following secrets to your GitHub repository (Settings → Secrets and variables → Actions):

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key for ECR and App Runner | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for ECR and App Runner | `wJalr...` |
| `AWS_SES_ACCESS_KEY_ID` | IAM user access key for SES | `AKIA...` |
| `AWS_SES_SECRET_ACCESS_KEY` | IAM user secret key for SES | `wJalr...` |
| `AWS_SES_FROM_EMAIL` | Verified sender email | `noreply@yourdomain.com` |
| `RECIPIENT_EMAIL` | Email to receive form submissions | `chris.burkhardt@live.com` |
| `APP_RUNNER_SERVICE_ARN` | App Runner service ARN | `arn:aws:apprunner:...` |
| `APP_RUNNER_DOMAIN` | App Runner domain (optional) | `xxx.us-east-1.awsapprunner.com` |

To get the App Runner service ARN:
```bash
aws apprunner list-services --region us-east-1
```

## Local Testing with Docker

Build and run the container locally:

```bash
# Build the Docker image
docker build -t windows-by-burkhardt .

# Run the container
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret \
  -e AWS_SES_FROM_EMAIL=noreply@yourdomain.com \
  -e RECIPIENT_EMAIL=chris.burkhardt@live.com \
  windows-by-burkhardt

# Access the application
open http://localhost:3000
```

## Manual Deployment

To manually deploy to AWS:

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <YOUR_ECR_REGISTRY>

# Build and tag image
docker build -t windows-by-burkhardt .
docker tag windows-by-burkhardt:latest <YOUR_ECR_REGISTRY>/windows-by-burkhardt:latest

# Push to ECR
docker push <YOUR_ECR_REGISTRY>/windows-by-burkhardt:latest

# Update App Runner service
aws apprunner update-service \
  --service-arn <YOUR_SERVICE_ARN> \
  --source-configuration "ImageRepository={ImageIdentifier=<YOUR_ECR_REGISTRY>/windows-by-burkhardt:latest}" \
  --region us-east-1
```

## Monitoring and Logs

View logs in AWS Console:
1. Go to AWS App Runner
2. Select your service
3. Click on "Logs" tab

Or use AWS CLI:
```bash
aws apprunner list-operations \
  --service-arn <YOUR_SERVICE_ARN> \
  --region us-east-1
```

## Custom Domain Setup

To use a custom domain:

1. Go to AWS App Runner Console
2. Select your service
3. Click "Custom domains"
4. Follow the wizard to add your domain
5. Update DNS records as instructed

## Scaling Configuration

App Runner auto-scales based on traffic. To adjust:

```bash
aws apprunner update-service \
  --service-arn <YOUR_SERVICE_ARN> \
  --auto-scaling-configuration-arn <CONFIG_ARN> \
  --region us-east-1
```

## Cost Estimation

- **App Runner**: ~$25-50/month (varies with traffic)
- **ECR**: ~$0.10/GB/month for storage
- **SES**: $0.10 per 1,000 emails
- **Data transfer**: Varies with usage

## Security Best Practices

1. Use AWS Secrets Manager for sensitive data
2. Enable AWS WAF for App Runner
3. Use VPC connector for private resources
4. Regularly rotate access keys
5. Monitor with AWS CloudWatch

## Troubleshooting

### Service won't start
- Check CloudWatch logs for errors
- Verify environment variables are set
- Ensure ECR image is accessible

### Email not sending
- Verify SES email addresses are verified
- Check IAM permissions for SES user
- Review CloudWatch logs for SES errors
- Confirm you're not in SES sandbox mode (or verify recipient)

### Deployment fails
- Verify GitHub secrets are correct
- Check AWS credentials have necessary permissions
- Ensure ECR repository exists
- Review GitHub Actions logs
