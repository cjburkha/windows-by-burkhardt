require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const xss = require('xss');
const emailService = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  }
}));
app.use(cors({ origin: ['https://windowsbyburkhardt.com', 'https://www.windowsbyburkhardt.com'] }));

// Limit request body size to 10kb to prevent payload flooding
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));

// Rate limit the contact endpoint: max 5 submissions per 15 min per IP
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many requests. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Serve static files
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    let { name, email, phone, address, city, state, zip, preferredDate, preferredTime, message,
          referralFirstName, referralLastName, referralPhone } = req.body;

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({ success: false, message: 'Name, email, and phone are required fields.' });
    }

    // Validate email format
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    // Validate field lengths to prevent abuse
    if (name.length > 100 || email.length > 254 || phone.length > 20 ||
        (address && address.length > 200) || (message && message.length > 2000)) {
      return res.status(400).json({ success: false, message: 'One or more fields exceed the maximum allowed length.' });
    }

    // Sanitize all string inputs to strip XSS payloads
    name        = xss(validator.trim(name));
    email       = validator.normalizeEmail(email) || email;
    phone       = validator.trim(phone).replace(/[^\d\s\-()+.]/g, '');
    address     = address     ? xss(validator.trim(address))     : '';
    city        = city        ? xss(validator.trim(city))        : '';
    state       = state       ? validator.trim(state).replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase() : '';
    zip         = zip         ? validator.trim(zip).replace(/\D/g, '').substring(0, 5) : '';
    message     = message     ? xss(validator.trim(message))     : '';
    preferredTime = preferredTime ? validator.trim(preferredTime) : '';
    referralFirstName = referralFirstName ? xss(validator.trim(referralFirstName)).substring(0, 100) : '';
    referralLastName  = referralLastName  ? xss(validator.trim(referralLastName)).substring(0, 100)  : '';
    referralPhone     = referralPhone     ? validator.trim(referralPhone).replace(/[^\d\s\-()+.]/g, '').substring(0, 20) : '';

    // Validate date is a real future date if provided
    if (preferredDate) {
      if (!validator.isDate(preferredDate) || new Date(preferredDate) < new Date()) {
        preferredDate = '';
      }
    }

    const emailResult = await emailService.sendConsultationRequest({
      name, email, phone, address, city, state, zip, preferredDate, preferredTime, message,
      referralFirstName, referralLastName, referralPhone
    });

    if (emailResult.success) {
      res.json({ 
        success: true, 
        message: 'Your consultation request has been submitted successfully!' 
      });
    } else {
      throw new Error(emailResult.error);
    }
  } catch (error) {
    console.error('Error processing contact form:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit your request. Please try again later.' 
    });
  }
});

// Health check endpoint for AWS
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
