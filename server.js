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

app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'education_platform',
  password: 'Murali@123',
  port: 5010, // Default PostgreSQL port
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
      text: `Dear ${fullname},\n\nYour enrollment application numbered: ${applicationnumber} has been approved.\n\nCongratulations!\n\nSincerely,\nThe Admin Team\nEducation Platform `,
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
