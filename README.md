# Windows by Burkhardt

A professional consultation scheduling website for Windows by Burkhardt, co-branded with Apex Energy Group. This application allows customers to schedule in-home consultations for window installation services.

## Features

- 📝 **Contact Form**: Easy-to-use form for scheduling consultations
- 📧 **Email Notifications**: Automatic email notifications via AWS SES
- 🐳 **Containerized**: Docker support for consistent deployments
- 🚀 **CI/CD Pipeline**: Automated deployment via GitHub Actions
- ☁️ **AWS Deployment**: Configured for AWS App Runner
- 📱 **Responsive Design**: Works perfectly on desktop and mobile devices
- 🎨 **Co-branded**: Professional design showcasing both brands

## Tech Stack

- **Backend**: Node.js with Express
- **Email Service**: AWS SES (Simple Email Service)
- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Containerization**: Docker
- **Cloud Platform**: AWS (ECR + App Runner)
- **CI/CD**: GitHub Actions

## Project Structure

```
windows-by-burkhardt/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions CI/CD pipeline
├── public/
│   ├── index.html              # Main HTML page
│   ├── styles.css              # Styling
│   └── script.js               # Client-side JavaScript
├── services/
│   └── emailService.js         # AWS SES email service
├── server.js                   # Express server
├── package.json                # Node.js dependencies
├── Dockerfile                  # Docker configuration
├── .dockerignore               # Docker ignore file
├── .gitignore                  # Git ignore file
├── .env.example                # Environment variables template
├── AWS_DEPLOYMENT.md           # AWS deployment guide
└── README.md                   # This file
```

## Local Development Setup

### Prerequisites

- Node.js 18+ installed
- AWS account with SES configured
- Git installed

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/windows-by-burkhardt.git
cd windows-by-burkhardt
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

Edit `.env` and add your AWS credentials:

```env
PORT=3000
NODE_ENV=development

# AWS SES Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_SES_FROM_EMAIL=noreply@yourdomain.com

# Email Configuration
RECIPIENT_EMAIL=chris.burkhardt@live.com
```

### Step 4: Run Locally

```bash
# Development mode with auto-reload
npm run dev

# Or production mode
npm start
```

The application will be available at `http://localhost:3000`

### Step 5: Test Email Functionality

**Important**: AWS SES starts in sandbox mode, which requires you to verify both sender and recipient email addresses.

1. Verify email addresses in AWS Console:
   - Go to AWS SES → Email Addresses
   - Click "Verify a New Email Address"
   - Verify both sender and recipient emails

2. Test the contact form by submitting it locally

## Running with Docker Locally

```bash
# Build the Docker image
docker build -t windows-by-burkhardt .

# Run the container
docker run -p 3000:3000 \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret \
  -e AWS_SES_FROM_EMAIL=noreply@yourdomain.com \
  -e RECIPIENT_EMAIL=chris.burkhardt@live.com \
  windows-by-burkhardt
```

Access the application at `http://localhost:3000`

## AWS Deployment

### Quick Setup

1. **Create AWS Resources** (one-time setup):
   - ECR repository for Docker images
   - App Runner service for hosting
   - SES email verification
   - IAM user for SES access

2. **Configure GitHub Secrets**:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_SES_ACCESS_KEY_ID`
   - `AWS_SES_SECRET_ACCESS_KEY`
   - `AWS_SES_FROM_EMAIL`
   - `RECIPIENT_EMAIL`
   - `APP_RUNNER_SERVICE_ARN`

3. **Deploy**:
   - Push to `main` branch
   - GitHub Actions automatically builds and deploys

See [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) for detailed instructions.

## GitHub Repository Setup

### Step 1: Initialize Git

```bash
cd /Users/chrisb/dev/windows-by-burkhardt
git init
git add .
git commit -m "Initial commit: Windows by Burkhardt consultation website"
```

### Step 2: Create GitHub Repository

1. Go to GitHub and create a new repository named `windows-by-burkhardt`
2. Don't initialize with README (we already have one)

### Step 3: Push to GitHub

```bash
git remote add origin https://github.com/yourusername/windows-by-burkhardt.git
git branch -M main
git push -u origin main
```

### Step 4: Configure GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

Add all required secrets as documented in [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md)

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment mode | No | development |
| `AWS_REGION` | AWS region for SES | Yes | us-east-1 |
| `AWS_ACCESS_KEY_ID` | AWS access key | Yes | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Yes | - |
| `AWS_SES_FROM_EMAIL` | Sender email address | Yes | - |
| `RECIPIENT_EMAIL` | Recipient email address | Yes | chris.burkhardt@live.com |

## API Endpoints

### `GET /`
Serves the main HTML page

### `POST /api/contact`
Submits a consultation request

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "(555) 123-4567",
  "address": "123 Main St",
  "city": "Anytown",
  "state": "CA",
  "zip": "12345",
  "preferredDate": "2026-04-15",
  "preferredTime": "Morning (8am-12pm)",
  "message": "Interested in replacing 5 windows"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Your consultation request has been submitted successfully!"
}
```

### `GET /health`
Health check endpoint for AWS

**Response:**
```json
{
  "status": "healthy"
}
```

## Development Workflow

1. Make changes to code
2. Test locally with `npm run dev`
3. Commit changes: `git commit -am "Description of changes"`
4. Push to GitHub: `git push`
5. GitHub Actions automatically deploys to AWS

## Customization

### Change Branding Colors

Edit `public/styles.css`:

```css
:root {
    --primary-color: #2c5282;     /* Main brand color */
    --secondary-color: #1a365d;   /* Secondary brand color */
    --apex-color: #d97706;        /* Apex Energy Group color */
}
```

### Modify Form Fields

Edit `public/index.html` to add/remove form fields. Don't forget to update:
1. `public/script.js` - form data collection
2. `server.js` - validation logic
3. `services/emailService.js` - email template

### Change Email Template

Edit `services/emailService.js` to customize the email format sent to chris.burkhardt@live.com

## Troubleshooting

### Emails Not Sending

1. Verify AWS SES email addresses in AWS Console
2. Check AWS credentials in `.env` file
3. Review server logs for SES errors
4. Ensure SES is out of sandbox mode (or recipient is verified)

### Docker Build Fails

1. Ensure Docker is running
2. Check Dockerfile syntax
3. Verify all files are present

### Deployment Fails

1. Check GitHub Actions logs
2. Verify all GitHub secrets are set correctly
3. Ensure AWS resources are created
4. Check AWS IAM permissions

### Local Server Won't Start

1. Check if port 3000 is already in use
2. Verify `.env` file exists and is configured
3. Run `npm install` to ensure dependencies are installed

## Security Notes

- Never commit `.env` file to Git
- Rotate AWS credentials regularly
- Use IAM roles with minimal required permissions
- Enable AWS CloudWatch for monitoring
- Consider using AWS Secrets Manager for production

## Support

For issues or questions:
- Review [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md)
- Check GitHub Issues
- Review AWS CloudWatch logs

## License

MIT License - feel free to use and modify as needed.

## Credits

Built for Windows by Burkhardt in partnership with Apex Energy Group.
