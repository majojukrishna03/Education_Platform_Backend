const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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
`;

pool.query(createTablesQuery, (err, res) => {
  if (err) {
    console.error('Error creating tables:', err);
  } else {
    console.log('Tables "registrations", "admin_registrations", and "courses" are ready');
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
    // console.error('Error creating course:', error);
    res.status(500).json({ message: 'Course creation failed.' });
  }
});

// Protected route example
app.get('/api/dashboard', verifyToken, (req, res) => {
  res.json({ message: `Welcome ${req.user.fullName}!` });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
