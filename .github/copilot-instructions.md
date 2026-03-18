<!-- Project-specific Copilot instructions for Windows by Burkhardt -->

## Project Overview
Windows by Burkhardt is a consultation scheduling website co-branded with Apex Energy Group. It's a Node.js/Express application with AWS SES email integration, containerized with Docker, and deployed to AWS via GitHub Actions.

## Tech Stack
- Backend: Node.js with Express
- Email: AWS SES
- Frontend: Vanilla HTML/CSS/JavaScript
- Container: Docker
- Deployment: AWS App Runner via ECR
- CI/CD: GitHub Actions

## Key Files
- `server.js` - Express server and API endpoints
- `services/emailService.js` - AWS SES email integration
- `public/index.html` - Main consultation form
- `public/styles.css` - Styling with co-branding
- `public/script.js` - Form validation and submission
- `Dockerfile` - Container configuration
- `.github/workflows/deploy.yml` - CI/CD pipeline

## Environment Variables
Always reference `.env.example` for required environment variables. Email recipient is chris.burkhardt@live.com.

## Development Guidelines
- Use ES6+ JavaScript features
- Follow existing code style and patterns
- Test email functionality with verified SES addresses
- Ensure Docker builds succeed before committing
- Keep responsive design for mobile compatibility

## Deployment Process
1. Local testing with `npm run dev`
2. Docker testing with `docker build`
3. Commit to `main` branch triggers GitHub Actions
4. GitHub Actions builds and pushes to ECR
5. App Runner automatically deploys new container

## AWS Resources
- ECR: windows-by-burkhardt repository
- App Runner: windows-by-burkhardt service
- SES: Configured in us-east-1 region
- IAM: Separate user for SES with minimal permissions

## Common Tasks
- Add form fields: Update HTML, JS validation, email template
- Change branding: Modify CSS variables in `styles.css`
- Update email template: Edit `services/emailService.js`
- Modify deployment: Update `.github/workflows/deploy.yml`
