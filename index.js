const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 3000


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


// middleware
app.use(express.json());
app.use(cors());

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // create database
        const db = client.db('ticket_bari_db');
        const usersCollection = db.collection('users');

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
        app.get('/users/:id', async (req, res) => {


        })

        // get users with role by email --> useRole
        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);

            res.send({ role: user?.role || 'user' });
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