//importing express api
import express from 'express';
import type { Request, Response } from 'express';

//Import sql connection tool this can be changed if we want to use mysql
import { Pool } from 'pg';

//this will allow the frontend (html stuff) to commicate with the backend stuff
import cors from 'cors';

//creating express application instance
const app = express();

//this is the middleware which will allow requests from the browser 
app.use(cors());
app.use(express.json());

//this is creating the conncetion pool to the sql server
const pool = new Pool({
    user: 'postgres', //database username
    host: 'localhost', //where our db is currently running will need to be changed if site is live i think
    database: 'Palouse_properties', // database name
    password: 'admin', //databse password
    port:5432, //defualt postgre port
});


//this defines the structure of incoming data
interface MaintenanceRequest{
    ticketID: string;
    firstName: string;
    lastName: string;
    email: string;
    phone:string;
    address:string;
    unit?: string; // optional/null
    category: string;
    description: string;
    preferredTime?: string; //optional /null
}

//thi routes the api calls POST means send data to server
app.post('/submit-maintenance', async(req: Request, res: Response) => {
    try {
        // grabs incoming json data from frontend
        const data: MaintenanceRequest = req.body;

        //sql query to actually insert data into table
        const result = await pool.query(
            `INSERT INTO maintenance_requests
            (ticket_id, first_name, last_name, email, phone, address, unit, catergory, description, preferred_time)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING *`,

            //values getting inserted
            [
                data.ticketID,
                data.firstName,
                data.lastName,
                data.email,
                data.phone,
                data.address,
                data.unit || null, //if empty will store null in table 
                data.category,
                data.description,
                data.preferredTime || null // if empty will be null in table
            ]
        );

        //sends success repsone back to frontend
        res.json({
            success: true,
            data: result.rows[0] // returns inserted row
        });

        
    } catch(err){
        //if issues in proccess
        console.error(err);

        //sends failure response
        res.status(500).json({success:false})
    }
});

//srtarts server on port 3000 (localhost:3000) probaly have to change if site goes live on github or somehwere else
app.listen(3000, () => {
    console.log('server is running on http://localhost:3000');
});