const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 3000
// generate tracking id
const crypto = require('crypto');

// firebase 
const admin = require("firebase-admin");

// firebase
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

function generateTrackingId() {
    const prefix = "TCKT"; // your brand prefix
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random

    return `${prefix}-${date}-${random}`;
}
// test
console.log(generateTrackingId());


// middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
    // console.log('headers in the middleware', req.headers.authorization);
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }

    try {
        const idToken = token.split(' ')[1];    // must white space dite hobe... 
        const decoded = await admin.auth().verifyIdToken(idToken);     // must add
        console.log('decoded in the token : ', decoded);
        req.decoded_email = decoded.email;

        next();
    }
    catch (err) {
        return res.status(401).send({ message: 'unauthorized access' });
    }


}

// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@gampi.pfydvdc.mongodb.net/?appName=Gampi`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // create database
        const db = client.db('ticket_bari_db');
        const usersCollection = db.collection('users');
        const ticketsCollection = db.collection('tickets');
        const trackingsCollection = db.collection('trackings');

        // middleware admin before allowing admin activity
        // must be used after verifyFBToken middlware

        // verify admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }
        // verify vendor
        const verifyVendor = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'vendor') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // tracking log
        const logTracking = async (trackingId, status) => {
            const log = {
                trackingId,
                status,
                details: status.split('_').join(' '),
                createdAt: new Date()
            }
            const result = await trackingsCollection.insertOne(log);
            return result;
        }

        // users related apis
        // get users
        app.get('/users', async (req, res) => {

            const searchText = req.query.searchText;
            const query = {};

            if (searchText) {
                // query.displayName = { $regex: searchText, $options: 'i' }; // single search by name

                // search by name and email 
                query.$or = [
                    { displayName: { $regex: searchText, $options: 'i' } },
                    { email: { $regex: searchText, $options: 'i' } }
                ]
            }

            const cursor = usersCollection.find(query).sort({ createAt: - 1 }).limit(5);
            const result = await cursor.toArray();  // userdb teke user k array akare newar jonno
            res.send(result);
        })

        // get users by id
        // app.get('/users/:id', async (req, res) => {

        // })


        // get users with role by email --> useRole
        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);

            res.send({ role: user?.role || 'user' });
        })

        // get single user by email in profile
        app.get('/users/:email/myProfile', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            const result = await usersCollection.findOne(query);

            res.send(result);
        })


        // get all user from user --> user profile in dashboard
        app.get('/users/role/user', async (req, res) => {
            const query = { role: 'user' };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })

        // get vendors from db --> vendor profile
        app.get('/users/vendors', async (req, res) => {
            const query = { role: 'vendor' };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })

        // get admin from db --> admin profile
        app.get('/users/admins', async (req, res) => {
            const query = { role: 'admin' };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })

        // user create
        app.post('/users', async (req, res) => {
            const user = req.body;

            // by default --> user - normal user
            user.role = 'user';
            user.createdAt = new Date();
            const email = user.email;

            const userExists = await usersCollection.findOne({ email });

            if (userExists) {
                return res.send({ message: 'user exists' });
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        })


        // update user from manage users in admin
        app.patch('/users/:id/role', async (req, res) => {
            const id = req.params.id;
            const roleInfo = req.body;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: roleInfo.role
                }
            }
            const result = await usersCollection.updateOne(query, updateDoc);
            res.send(result);
        })

        // tickets related apis

        // get tickets --> vendor my added tickets,admin tickets, home advertisement,
        app.get('/tickets', async (req, res) => {
            const query = {};
            const { email, status, isAdvertised } = req.query;    // exact kono kichu pete cai like email

            // parcels?email='' &
            if (email) {
                query.vendorEmail = email;  // sender er email diye sodo matro tar info gulo dekar jonne
            }
            // verification status check
            if (status) {
                query.status = status;
            }
            // isAdvertised = true ? check
            if (isAdvertised) {
                query.isAdvertised = true;
            }

            const options = { sort: { createAt: -1 } }

            const cursor = ticketsCollection.find(query, options);

            // limit 6 for advertisement
            if (isAdvertised) {
                const result = await cursor.limit(6).toArray();
                return res.send(result);
            }

            const result = await cursor.toArray();
            res.send(result);
        })

        // get single tickets --> vendor update tickets
        app.get('/tickets/single/:ticketId', async (req, res) => {
            const ticketId = req.params.ticketId;
            const query = { _id: new ObjectId(ticketId) };
            const result = await ticketsCollection.findOne(query);
            res.send(result);
        })

        // create tickets --> vendor add tickets
        app.post('/tickets', async (req, res) => {
            const ticket = req.body;    // req body te jeigulo ace seigulo nibe 
            const trackingId = generateTrackingId();
            // ticket created time
            ticket.createAt = new Date();
            ticket.trackingId = trackingId;

            logTracking(trackingId, 'pending');

            const result = await ticketsCollection.insertOne(ticket); // ticket insert korbe
            res.send(result);   // result ta send kore dibe
        })

        // TODO : rename tis to the specific like /parcels/:id/assign
        // patch parcel -- assign rider
        app.patch('/tickets/:id/status', async (req, res) => {
            const { status } = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const updatedDoc = {
                $set: {
                    status: status
                }
            }

            const result = await ticketsCollection.updateOne(query, updatedDoc);
            res.send(result);

        })

        // update tickets --> vendor update ticket
        app.patch('/tickets/:ticketId', async (req, res) => {
            const ticketId = req.params.ticketId;
            const updatedData = req.body;
            const filter = { _id: new ObjectId(ticketId) };

            const { pricePerUnit, quantity } = updatedData;
            const price = parseFloat(pricePerUnit) || 0;
            const qty = parseInt(quantity) || 0;
            const calcTicketPrice = price * qty;

            const updatedDoc = {
                $set: {
                    ticketTitle: updatedData.ticketTitle,
                    pricePerUnit: price,
                    regionFrom: updatedData.regionFrom,
                    regionTo: updatedData.regionTo,
                    transportType: updatedData.transportType,
                    districtFrom: updatedData.districtFrom,
                    districtTo: updatedData.districtTo,
                    perks: updatedData.perks,
                    quantity: qty,
                    totalCost: calcTicketPrice,
                    departureTime: updatedData.departureTime,
                    status: 'pending'
                },
            };

            const result = await ticketsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        // update advertise --> admin advertise ticket
        app.patch('/tickets/:id/advertise', async (req, res) => {
            const id = req.params.id;
            const { isAdvertised } = req.body;

            if (isAdvertised) {
                const count = await ticketsCollection.countDocuments({ isAdvertised: true });
                if (count >= 6) {
                    return res.send({ message: 'Limit reached', modifiedCount: 0 });
                }
            }
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { isAdvertised: isAdvertised }
            };
            const result = await ticketsCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        // update advertise --> advertise section in homepage
        app.patch('/tickets/advertise/:id', async (req, res) => {
            const id = req.params.id;
            const { isAdvertised } = req.body;

            if (isAdvertised === true) {
                const advertisedCount = await ticketsCollection.countDocuments({ isAdvertised: true });

                if (advertisedCount >= 6) {
                    return res.status(400).send({
                        success: false,
                        message: "Limit exceeded! You can only advertise up to 6 tickets."
                    });
                }
            }

            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: { isAdvertised: isAdvertised }
            };

            const result = await ticketsCollection.updateOne(filter, updatedDoc);
            res.send({ success: true, result });
        });




        // delete ticket --> vendor - my added ticket 
        app.delete('/tickets/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await ticketsCollection.deleteOne(query);
            res.send(result);
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Zap is shifting shifting')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})