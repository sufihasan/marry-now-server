require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

//middle ware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bwnojnb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

        const usersCollection = client.db('marryDB').collection('users');
        const biodatasCollection = client.db('marryDB').collection('biodatas');
        const successStoriesCollection = client.db('marryDB').collection('successStories');



        //---------------
        // make api start
        //---------------

        //#######################################
        // -------- user related api start-------

        // save user info , if user already save just update last login
        app.post('/users', async (req, res) => {
            const email = req.body.email;
            // console.log(req.headers);
            const userExists = await usersCollection.findOne({ email });
            if (userExists) {
                // todo:update last login info

                // Update last_log_in field
                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { last_log_in: new Date().toISOString() } }
                );

                return res.status(200).send({ message: 'user already exits', inserted: false, result });
            }

            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // app.get('/users', async (req, res) => {
        //     const search = req.query.search || '';
        //     const query = search ? { name: { $regex: search, $options: 'i' } } : {};
        //     const users = await usersCollection.find(query).toArray();
        //     res.send(users);
        // });

        // GET /all-users-with-biodata-status?search=roky
        app.get('/all-users-with-biodata-status', async (req, res) => {
            try {
                const search = req.query.search || '';
                const query = search
                    ? { name: { $regex: search, $options: 'i' } } // case-insensitive
                    : {};

                const users = await usersCollection.find(query).toArray();

                const allBiodatas = await biodatasCollection.find({}).toArray();
                const biodataMap = {};

                allBiodatas.forEach((bio) => {
                    biodataMap[bio.email] = bio.bioDataStatus || 'not_premium';
                });

                const usersWithStatus = users.map((user) => ({
                    ...user,
                    bioDataStatus: biodataMap[user.email] || 'No Biodata',
                }));

                res.send(usersWithStatus);
            } catch (error) {
                res.status(500).send({ error: 'Failed to fetch users.' });
            }
        });


        // delete a favorite biodata from my favorite biodata
        app.patch('/users/remove-favorite', async (req, res) => {

            const { biodataId, email } = req.body;

            const result = await usersCollection.updateOne(
                { email },
                { $pull: { favorites: Number(biodataId) } } // Make sure biodataId id parseInt 
            );

            res.send(result);
        });

        // api for make admin of a user
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role: 'admin' } }
            );
            res.send(result);
        });


        // GET: Get user role by email
        app.get('/users/:email/role', async (req, res) => {
            try {
                const email = req.params.email;

                if (!email) {
                    return res.status(400).send({ message: 'Email is required' });
                }

                const user = await usersCollection.findOne({ email });

                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }

                res.send({ role: user.role || 'user' });
            } catch (error) {
                console.error('Error getting user role:', error);
                res.status(500).send({ message: 'Failed to get role' });
            }
        });


        // -------- user related api end-------
        //#######################################



        //#######################################
        // -------- biodata related api start----


        // GET /biodata/pending-premium --- admin api
        //Correct Order (Static first, then Dynamic):



        app.get('/bioDatas/pending-premium', async (req, res) => {
            // console.log('okk');
            const result = await biodatasCollection.find({ bioDataStatus: 'pending' }).toArray();
            // console.log(result);
            res.send(result);
        });

        // GET /bioDatas/premium-members?sort=asc|desc
        app.get('/bioDatas/premium-members', async (req, res) => {
            try {
                const sortOrder = req.query.sort === 'desc' ? -1 : 1;

                const result = await biodatasCollection
                    .find({ bioDataStatus: 'premium' })
                    .sort({ age: sortOrder })
                    .limit(6)
                    .toArray();

                res.send(result);
            } catch (error) {
                // console.error('Error fetching premium members:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // Get stats for total biodata, boys, girls, married
        app.get('/bioDatas/stats', async (req, res) => {
            try {
                const totalBiodata = await biodatasCollection.estimatedDocumentCount();

                const totalBoys = await biodatasCollection.countDocuments({ biodataType: "Male" });
                const totalGirls = await biodatasCollection.countDocuments({ biodataType: "Female" });

                // Future logic: completed marriages based on mariteStatus === "married"
                // const totalMarried = await biodatasCollection.countDocuments({ mariteStatus: "married" });

                res.send({
                    totalBiodata,
                    totalBoys,
                    totalGirls,
                    // totalMarried
                });
            } catch (error) {
                res.status(500).json({ error: 'Something went wrong' });
            }
        });


        app.get('/bioDatas/by-id/:biodataId', async (req, res) => {
            const biodataId = req.params.biodataId;
            console.log(biodataId);
            const biodataIdInt = parseInt(biodataId);
            const result = await biodatasCollection.findOne({ biodataId: biodataIdInt });
            res.send(result);
        })

        // get 3 similar biodata based on biodata type
        app.get('/biodata/similar/:biodataType', async (req, res) => {
            const { biodataType } = req.params;
            const excludeId = req.query.excludeId;

            try {

                const filter = {
                    biodataType,
                    biodataId: { $ne: Number(excludeId) } // Exclude current biodata and make sure number
                };

                const similarBiodatas = await biodatasCollection
                    .find(filter)
                    .limit(3) // Limit to 3 results
                    .toArray();

                res.send(similarBiodatas);
            } catch (error) {
                console.error('Error fetching similar biodatas:', error);
                res.status(500).send({ message: 'Failed to fetch similar biodatas' });
            }
        });

        // add new 1:06 pm 22 jul
        // add fevorite biodata api
        app.post('/bioDatas/favorites', async (req, res) => {
            // const { biodataId } = req.params;
            const { biodataId, userEmail } = req.body;
            // console.log(typeof biodataId);

            const result = await usersCollection.updateOne(
                { email: userEmail },
                { $addToSet: { favorites: biodataId } }
            );

            res.send(result);
        });

        // find all favorite biodata
        app.get('/bioDatas/favorites', async (req, res) => {
            const email = req.query.email;

            const user = await usersCollection.findOne({ email });
            if (!user) return res.status(404).send({ message: 'User not found' });

            const biodatas = await biodatasCollection.find({
                biodataId: { $in: user.favorites.map(id => id) }
            }).toArray();

            res.send(biodatas);
        });

        // to get login user biodata from dashboard
        app.get('/bioDatas/:email', async (req, res) => {
            const email = req.params.email;
            const result = await biodatasCollection.findOne({ email: email });
            res.send(result);
        })

        // Update biodata by email --- new addd
        app.patch('/bioDatas/:email', async (req, res) => {
            const email = req.params.email;
            console.log(email);
            const updatedData = req.body;
            // Prevent error: remove _id if it exists
            delete updatedData._id;
            console.log(updatedData);

            const result = await biodatasCollection.updateOne(
                { email },
                { $set: updatedData }
            );

            console.log(result);

            res.send(result);
        });

        // Request premium biodata (status not_premium to pending)
        app.patch('/bioDatas/premium-request/:id', async (req, res) => {
            const id = parseInt(req.params.id);
            const result = await biodatasCollection.updateOne(
                { biodataId: id },
                { $set: { bioDataStatus: 'pending' } }
            );
            res.send(result);
        });

        // PATCH /biodata/approve-premium/:id
        // app.patch('/bioDatas/approve-premium/:id', async (req, res) => {
        //     const id = parseInt(req.params.id);
        //     const result = await biodatasCollection.updateOne(
        //         { biodataId: id },
        //         { $set: { bioDataStatus: 'premium' } }
        //     );
        //     res.send(result);
        // });

        // PATCH /bioDatas/approve-premium/:idOrEmail
        app.patch('/bioDatas/approve-premium/:idOrEmail', async (req, res) => {
            const idOrEmail = req.params.idOrEmail;

            let filter = {};
            if (idOrEmail.includes('@')) {
                // It's an email
                filter = { email: idOrEmail };
            } else {
                // It's a biodataId
                filter = { biodataId: parseInt(idOrEmail) };
            }

            const result = await biodatasCollection.updateOne(
                filter,
                { $set: { bioDataStatus: 'premium' } }
            );

            res.send(result);
        });


        // get biodata api
        app.get('/bioDatas', async (req, res) => {

            try {
                const biodatas = await biodatasCollection
                    .find({})
                    .project({
                        biodataId: 1,
                        biodataType: 1,
                        image: 1,
                        permanentDivision: 1,
                        age: 1,
                        occupation: 1,
                    })
                    .toArray();

                res.send(biodatas);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch biodatas' });
            }
        });




        // set biodata to database and make unique id depend on last id
        app.post('/bioDatas', async (req, res) => {
            try {
                const newbiodata = req.body;
                // console.log(newbiodata);

                // n1: Get the latest biodataId (descending sort)
                const lastBiodata = await biodatasCollection
                    .find()
                    .sort({ biodataId: -1 })
                    .limit(1)
                    .toArray();

                // an example output of lastBiodata [  { biodataId: 6, name: 'John', age: 30 } ]
                //If the database is empty, the result will be: []

                const lastId = lastBiodata.length > 0 ? lastBiodata[0].biodataId : 0;

                // n2: Generate new biodataId
                const newBiodataId = lastId + 1;

                // n3: Attach it to new data
                const finalData = {
                    ...newbiodata,
                    biodataId: newBiodataId

                };

                // n4: Insert to DB
                const result = await biodatasCollection.insertOne(finalData);

                res.status(201).send({
                    success: true,
                    insertedId: result.insertedId,
                    biodataId: newBiodataId,
                    message: 'Biodata created successfully!'
                });

            } catch (err) {
                console.error(err);
                res.status(500).send({ success: false, message: 'Something went wrong.' });
            }

        });

        // -------- user related api end-------
        //#######################################



        //#######################################
        // -------- success story related api start-------

        // POST new success story
        app.post('/successStories', async (req, res) => {
            try {
                const story = req.body;
                const result = await successStoriesCollection.insertOne(story);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to post story', error });
            }
        });

        // GET all stories sorted by date (newest first)
        app.get('/successStories', async (req, res) => {
            try {
                const stories = await successStoriesCollection
                    .find({})
                    .sort({ marriageDate: -1 }) // Newest first
                    .toArray();
                res.json(stories);
            } catch (error) {
                res.status(500).json({ message: 'Failed to fetch stories', error });
            }
        });

        // -------- success story related api end-------
        //#######################################


        //---------------
        // make api end
        //---------------


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
    res.send('marry now is ongoing')
})

app.listen(port, () => {
    console.log(`marrynow is running on  ${port}`);
})