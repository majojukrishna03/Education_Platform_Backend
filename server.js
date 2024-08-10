const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.SECRET_KEY;

// Define allowed origins
const allowedOrigins = [
  'http://localhost:3000', // For local development
  'https://educationplatform03.netlify.app', // For production
];

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow requests with no origin
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
  credentials: true, // Enable cookies to be sent if needed
}));
app.use(bodyParser.json());

// const pool = new Pool({
//   user: 'postgres',
//   host: 'localhost',
//   database: 'education_platform',
//   password: 'Murali@123',
//   port: 5010, // Default PostgreSQL port
// });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Make sure this matches the Render provided URL
  ssl: {
    rejectUnauthorized: false
  }
});

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  service: 'gmail', // Update with your email service provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Test PostgreSQL connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err);
  } else {
    console.log('Connected to PostgreSQL on', pool.options.host);
  }
});

// Create tables if not exists
const createTablesQuery = `
  CREATE TABLE IF NOT EXISTS registrations (
    email VARCHAR(255) PRIMARY KEY,
    fullName VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_registrations (
    email VARCHAR(255) PRIMARY KEY,
    fullName VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL
  );
  CREATE TABLE IF NOT EXISTS courses (
    program VARCHAR(100) NOT NULL,
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL NOT NULL,
    duration VARCHAR(50) NOT NULL,
    startDate DATE NOT NULL,
    image TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS enrollments (
    applicationNumber VARCHAR(100) PRIMARY KEY,
    fullName VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    qualification VARCHAR(100) NOT NULL,
    degreeType VARCHAR(100),
    qualificationScore DECIMAL NOT NULL,
    courseId VARCHAR(100) NOT NULL,
    statementOfPurpose TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'In Processing'  -- Add the new column with default value
  );

  CREATE TABLE IF NOT EXISTS payments (
    payment_id SERIAL PRIMARY KEY,
    application_id VARCHAR(100) NOT NULL,
    fullname VARCHAR(255) NOT NULL,
    emailid VARCHAR(255) NOT NULL,
    courseid VARCHAR(100) NOT NULL,
    coursename VARCHAR(255) NOT NULL,
    course_fee DECIMAL NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_option VARCHAR(50) NOT NULL,
    card_number VARCHAR(20) NOT NULL,
    expiration_date VARCHAR(10) NOT NULL,
    cvv VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS totalpayments (
    payment_id INT NOT NULL,
    amount DECIMAL NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (payment_id),
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id)
  );

  CREATE TABLE IF NOT EXISTS payment_plan (
    payment_id INT NOT NULL,
    first_installment DECIMAL NOT NULL,
    second_installment DECIMAL NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    timestamp TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (payment_id),
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id)
  );
`;

pool.query(createTablesQuery, (err, res) => {
  if (err) {
    console.error('Error creating tables:', err);
  } else {
    console.log('Tables are ready');
  }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(403).json({ message: 'Token not provided' });
  }

  jwt.verify(token.split(' ')[1], SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.user = decoded;
    next();
  });
};

// Route to fetch all courses
app.get('/api/courses', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM courses');
    res.json(result.rows); // Sending courses as JSON response
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Route to fetch the number of admin registrations
app.get('/api/admin-count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM admin_registrations');
    const count = result.rows[0].count;
    console.log(count);
    res.send(count.toString()); // Sending count as plain text
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});


// Route to handle user registration
app.post('/api/register', async (req, res) => {
  const { fullName, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const insertQuery = 'INSERT INTO registrations (email, fullName, password) VALUES ($1, $2, $3) RETURNING *';
    const values = [email, fullName, hashedPassword];
    const result = await pool.query(insertQuery, values);
    
    res.status(201).json({ message: 'Registration successful!', registration: result.rows[0] });
  } catch (error) {
    console.error('Error saving registration:', error);
    res.status(500).json({ message: 'Registration failed.' });
  }
});

// Route to handle user login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const query = 'SELECT * FROM registrations WHERE email = $1';
    const values = [email];
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      const isPasswordMatch = await bcrypt.compare(password, result.rows[0].password);
      if (isPasswordMatch) {
        const token = jwt.sign({ email: result.rows[0].email, fullName: result.rows[0].fullname }, SECRET_KEY, { expiresIn: '1h' });
        res.status(200).json({ token });
      } else {
        res.status(401).json({ message: 'Login failed. Please check your credentials.' });
      }
    } else {
      res.status(401).json({ message: 'Login failed. Please check your credentials.' });
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Login failed. Please try again later.' });
  }
});

// Route to get user dashboard data
app.get('/api/dashboard', verifyToken, (req, res) => {
  const { email, fullName } = req.user;
  // console.log(fullName) 
  res.status(200).json({ message: `Welcome to your dashboard, ${fullName}!`, email, fullName });
});


// Route to handle admin registration
app.post('/api/admin/register', async (req, res) => {
  const { fullName, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const insertQuery = 'INSERT INTO admin_registrations (email, fullName, password) VALUES ($1, $2, $3) RETURNING *';
    const values = [email, fullName, hashedPassword];
    const result = await pool.query(insertQuery, values);
    
    res.status(201).json({ message: 'Admin registration successful!', registration: result.rows[0] });
  } catch (error) {
    console.error('Error saving admin registration:', error);
    res.status(500).json({ message: 'Admin registration failed.' });
  }
});

// Route to handle admin login
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const query = 'SELECT * FROM admin_registrations WHERE email = $1';
    const values = [email];
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      const isPasswordMatch = await bcrypt.compare(password, result.rows[0].password);
      if (isPasswordMatch) {
        const token = jwt.sign({ email: result.rows[0].email, fullName: result.rows[0].fullname }, SECRET_KEY, { expiresIn: '1h' });
        res.status(200).json({ token });
      } else {
        res.status(401).json({ message: 'Admin login failed. Please check your credentials.' });
      }
    } else {
      res.status(401).json({ message: 'Admin login failed. Please check your credentials.' });
    }
  } catch (error) {
    console.error('Error logging in admin:', error);
    res.status(500).json({ message: 'Admin login failed. Please try again later.' });
  }
});

// Route to create a new course
app.post('/api/admin/dashboard/create-course', async (req, res) => {
  const { id, title, description, price, duration, program, startDate, image } = req.body;

  try {
    // Check if course with the same ID already exists
    const checkQuery = 'SELECT EXISTS(SELECT 1 FROM courses WHERE id = $1)';
    const checkValues = [id];
    const checkResult = await pool.query(checkQuery, checkValues);

    if (checkResult.rows[0].exists) {
      // Course with the same ID already exists
      return res.status(400).json({ message: 'Course with the same ID already exists.' });
    }

    // If course doesn't exist, proceed with insertion
    const insertQuery = `
      INSERT INTO courses (id, title, description, price, duration, program, startDate, image) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
    const insertValues = [id, title, description, price, duration, program, startDate, image];
    const result = await pool.query(insertQuery, insertValues);
    
    res.status(201).json({ message: 'Course created successfully!', course: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: 'Course creation failed.' });
  }
});

// Route to fetch all courses grouped by program
app.get('/api/courses', async (req, res) => {
  try {
    const query = 'SELECT * FROM courses ORDER BY program, id';
    const result = await pool.query(query);
    
    const coursesByProgram = result.rows.reduce((acc, course) => {
      if (!acc[course.program]) {
        acc[course.program] = [];
      }
      acc[course.program].push(course);
      return acc;
    }, {});

    res.status(200).json(coursesByProgram);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Failed to fetch courses.' });
  }
});

// Route to handle enrollment form submissions
app.post('/api/enroll', async (req, res) => {
  const {
    applicationNumber,
    fullName,
    email,
    phone,
    qualification,
    degreeType,
    qualificationScore,
    courseId,
    statementOfPurpose,
  } = req.body;

  try {
    const insertQuery = `
      INSERT INTO enrollments (applicationNumber, fullName, email, phone, qualification, degreeType, qualificationScore, courseId, statementOfPurpose, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`;
    const values = [
      applicationNumber,
      fullName,
      email,
      phone,
      qualification,
      degreeType,
      qualificationScore,
      courseId,
      statementOfPurpose,
      'In Processing',  // Default status
    ];

    // Insert into database
    const result = await pool.query(insertQuery, values);

    // Send acknowledgment email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Enrollment Confirmation',
      text: `Dear ${fullName},\n\nYour application has been successfully submitted.\n\nApplication Number: ${applicationNumber}\n\nThank you!`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ message: 'Error sending acknowledgment email' });
      } else {
        console.log('Email sent: ' + info.response);
        res.status(201).json({ message: 'Form submitted successfully!', enrollment: result.rows[0] });
      }
    });
  } catch (error) {
    console.error('Error saving enrollment:', error);
    res.status(500).json({ message: 'Form submission failed.' });
  }
});


// Route to handle tracking application status by application number
app.get('/api/applications/:applicationNumber', async (req, res) => {
  const { applicationNumber } = req.params;

  try {
    const query = 'SELECT status FROM enrollments WHERE applicationNumber = $1';
    const values = [applicationNumber];
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      res.status(200).json({ status: result.rows[0].status, application: result.rows[0] });
    } else {
      res.status(404).json({ message: 'Application not found' });
    }
  } catch (error) {
    console.error('Error fetching application status:', error);
    res.status(500).json({ message: 'Error fetching application status' });
  }
});

// Fetch application and course details
app.get('/api/applications/:applicationId/details', async (req, res) => {
  const { applicationId } = req.params;
  try {
    const applicationDetails = await pool.query(
      `SELECT 
  enrollments.applicationnumber AS applicationId, 
  enrollments.fullname AS fullname,
  enrollments.email AS emailId,
  courses.id AS courseId, 
  courses.title AS courseName, 
  courses.price AS courseMoney
FROM enrollments
JOIN courses ON enrollments.courseid = courses.id
WHERE enrollments.applicationnumber = $1`
, [applicationId]);

    if (applicationDetails.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(applicationDetails.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Endpoint to handle payment submission
app.post('/api/payments', async (req, res) => {
  const { applicationId, courseDetails, paymentMethod, paymentOption, cardNumber, expirationDate, cvv } = req.body;

  try {
    // Insert payment data into payments table
    const { rows } = await pool.query(
      'INSERT INTO payments (application_id, fullname, emailid, courseid, coursename, course_fee, payment_method, payment_option, card_number, expiration_date, cvv, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()) RETURNING *',
      [applicationId, courseDetails.fullname, courseDetails.emailid, courseDetails.courseid, courseDetails.coursename, courseDetails.coursemoney, paymentMethod, paymentOption, cardNumber, expirationDate, cvv]
    );

    // Extract the inserted payment details
    const insertedPayment = rows[0];

    // Handle payment plan if selected
    if (paymentOption === 'payment_plan') {
      // Example: Insert first installment (half amount)
      const installmentAmount = courseDetails.coursemoney / 2; // Adjust based on your logic

      // Insert into payment_plan table
      await pool.query(
        'INSERT INTO payment_plan (payment_id, first_installment, second_installment, status, timestamp) VALUES ($1, $2, $3, $4, NOW())',
        [insertedPayment.payment_id, installmentAmount, courseDetails.coursemoney - installmentAmount, 'pending']
      );

      // Send acknowledgment for payment plan
      await sendAcknowledgmentEmailForPaymentPlan(courseDetails.emailid, applicationId, installmentAmount, courseDetails.coursemoney, courseDetails.fullname);
    } else if (paymentOption === 'full_payment') {
      // Insert into totalpayments table for full payment
      await pool.query(
        'INSERT INTO totalpayments (payment_id, amount, timestamp) VALUES ($1, $2, NOW())',
        [insertedPayment.payment_id, courseDetails.coursemoney]
      );

      // Send acknowledgment for full payment
      await sendAcknowledgmentEmailForFullPayment(courseDetails.emailid, applicationId, courseDetails.coursemoney, courseDetails.fullname);
    }

    res.status(201).json({ message: 'Payment processed successfully', paymentId: insertedPayment.payment_id });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'An error occurred while processing payment' });
  }
});

// Function to send acknowledgment email for full payment
const sendAcknowledgmentEmailForFullPayment = async (emailid, applicationId, amount, fullname) => {
  try {
    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailid,
      subject: 'Payment Acknowledgment - Full Payment',
      text: `
        Dear ${fullname},

        We have successfully received your full payment of Rs.${amount} for Application ID: ${applicationId}.

        Thank you for choosing our platform. If you have any questions, feel free to contact us.

        Best regards,
        Admin Team
        Education Platform
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

// Function to send acknowledgment email for payment plan
const sendAcknowledgmentEmailForPaymentPlan = async (emailid, applicationId, firstInstallment, totalAmount, fullname) => {
  try {
    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailid,
      subject: 'Payment Acknowledgment - Payment Plan',
      text: `
        Dear ${fullname},

        We have successfully received your first installment of Rs.${firstInstallment} for Application ID: ${applicationId}. You are required to pay the second installment of Rs.${(totalAmount - firstInstallment).toFixed(2)} within one month.

        Thank you for choosing our platform. If you have any questions, feel free to contact us.

        Best regards,
        Admin Team
        Education Platform
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

// Example endpoint to fetch payment status
app.get('/api/payments/:applicationId', async (req, res) => {
  const { applicationId } = req.params;

  try {
    // Query your PostgreSQL database for payment status
    const payment = await pool.query('SELECT * FROM payments WHERE application_id = $1', [applicationId]);

    if (payment.rows.length === 0) {
      return res.json({ paymentDone: false }); // No payment found
    }

    // You might have additional logic to check payment status
    // For simplicity, assume payment is done if a record is found
    res.json({ paymentDone: true });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Example server-side route to fetch enrolled courses by user's full name
app.get('/api/dashboard/enrolled-courses', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', ''); // Extract token

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify token and get user details
    const user = jwt.verify(token, process.env.SECRET_KEY); // Replace with your JWT secret key
    // Fetch enrolled courses based on user's full name
    const enrolledCourses = await pool.query('SELECT courseid AS courseId, coursename AS courseName FROM payments WHERE fullname = $1', [user.fullName]);
    res.json({ enrolledCourses: enrolledCourses.rows });
  } catch (error) {
    console.error('Error fetching enrolled courses:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



// Route to fetch all applications for review
app.get('/api/admin/dashboard/applications', verifyToken, async (req, res) => {
  try {
    const query = ' SELECT e.*, c.title AS courseName FROM enrollments e INNER JOIN courses c ON e.courseid = c.id WHERE e.status = $1 ORDER BY e.applicationNumber';
    const values = ['In Processing']; // Change the status value if needed
    const result = await pool.query(query, values);
    
    res.status(200).json({ applications: result.rows });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ message: 'Failed to fetch applications.' });
  }
});

// Route to approve an enrollment and send confirmation email
app.put('/api/admin/dashboard/applications/:applicationnumber/approve', verifyToken, async (req, res) => {
  const { applicationnumber } = req.params;
  const { status } = req.body;

  try {
    // Update enrollment status in the database and fetch fullname and email
    const updateQuery = `
      UPDATE enrollments
      SET status = $1
      WHERE applicationnumber = $2
      RETURNING fullname, email`;
    const values = [status, applicationnumber];
    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Send acknowledgment email to the student
    const { fullname, email } = result.rows[0];
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Enrollment Approval Confirmation',
      text: `Dear ${fullname},\n\nYour enrollment application numbered: ${applicationnumber} has been approved.\n\nPlease complete the payment by tracking application to access the course.\n\nHappy learning!\n\nSincerely,\nThe Admin Team\nEducation Platform `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ message: 'Error sending confirmation email' });
      } else {
        console.log('Email sent: ' + info.response);
        res.status(200).json({ message: 'Enrollment approved successfully!', enrollment: { fullname, email, applicationnumber, status } });
      }
    });

  } catch (error) {
    console.error('Error approving enrollment:', error);
    res.status(500).json({ message: 'Failed to approve enrollment.' });
  }
});



// Route to deny an enrollment application and send an email notification
app.put('/api/admin/dashboard/applications/:applicationnumber/deny', verifyToken, async (req, res) => {
  const { applicationnumber } = req.params;

  try {
    // Update enrollment status in the database to 'Denied'
    const updateQuery = 'UPDATE enrollments SET status = $1 WHERE applicationnumber = $2 RETURNING fullname,email';
    const values = ['Denied', applicationnumber];
    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Send acknowledgment email to the student
    const { fullname, email } = result.rows[0];
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Enrollment Denial Notification',
      text: `Dear ${fullname},\n\nYour enrollment application numbered: ${applicationnumber} has been denied.\n\nWe appreciate your interest and encourage you to consider other opportunities.\n\nSincerely,\nThe Admin Team\nEducation Platform`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ message: 'Error sending confirmation email' });
      } else {
        console.log('Email sent: ' + info.response);
        res.status(200).json({ message: 'Enrollment denied successfully!', enrollment: result.rows[0] });
      }
    });

  } catch (error) {
    console.error('Error denying enrollment:', error);
    res.status(500).json({ message: 'Failed to deny enrollment.' });
  }
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
