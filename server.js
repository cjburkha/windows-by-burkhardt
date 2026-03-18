require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const emailService = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline styles for simplicity
}));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zip, preferredDate, preferredTime, message } = req.body;

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, and phone are required fields.' 
      });
    }

    // Send email
    const emailResult = await emailService.sendConsultationRequest({
      name,
      email,
      phone,
      address,
      city,
      state,
      zip,
      preferredDate,
      preferredTime,
      message
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
