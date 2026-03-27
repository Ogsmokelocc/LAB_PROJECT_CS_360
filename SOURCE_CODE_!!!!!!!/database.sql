CREATE TABLE maintenance_form(
    id SERIAL PRIMARY KEY,
    ticket_id VARCHAR(20) UNIQUE NOT NULL,

    firstName VARCHAR(100) NOT NULL,
    lastName VARCHAR(100) NOT NULL,

    email VARCHAR(150) NOT NULL,
    phone VARCHAR(14) NOT NULL,

    address TEXT NOT NULL,
    unit VARCHAR(10),

    catagory VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    preferred_time TEXT,

    submitted_at TIMESTAMP DEFUALT CURRENT_TIMESTAMP
);