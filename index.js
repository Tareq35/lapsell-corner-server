const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

const app = express();

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.x8ynutp.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })

}

async function run() {
    try {
        const usersCollection = client.db('lapsellCorner').collection('users');
        const categoriesCollection = client.db('lapsellCorner').collection('categories');
        const productsCollection = client.db('lapsellCorner').collection('products');
        const bookingProductsCollection = client.db('lapsellCorner').collection('bookingProducts');
        const paymentsCollection = client.db('lapsellCorner').collection('payments');
        const reportedProductsCollection = client.db('lapsellCorner').collection('reportedProducts');

        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        //jwt section
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        });

        //Users section
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });
        app.get('/buyers', async (req, res) => {
            const query = { accountType: "buyer" };
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });
        app.get('/sellers', async (req, res) => {
            const query = { accountType: "seller" };
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });
        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            res.send(result)
        })

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        });

        app.get('/users/seller/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            console.log(user)
            res.send({ isSeller: user?.accountType === 'seller' });
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options)
            res.json(result);
        });
        app.put('/users/sellerStatus', verifyJWT, verifyAdmin, async (req, res) => {
            const data = req.body;
            const filter1 = { _id: ObjectId(data.id) };
            const filter2 = { sellerEmail: data.email };
            const updateDoc1 = { $set: { verify: !data.verify } };
            const updateDoc2 = { $set: { verify: !data.verify } };
            const result1 = await usersCollection.updateOne(filter1, updateDoc1)
            const result2 = await productsCollection.updateMany(filter2, updateDoc2)
            res.json(result1);
        });

        // Categories section
        app.get('/categories', async (req, res) => {
            const query = {};
            const categories = await categoriesCollection.find(query).toArray();
            res.send(categories);
        });

        //Products by Email, Category, Advertised section
        app.get('/products/:email', async (req, res) => {
            const email = req.params.email;
            const query = { sellerEmail: email }

            const products = await productsCollection.find(query).toArray();
            res.send(products);
        });

        app.delete('/products/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(filter);
            res.send(result)
        })

        app.post('/products', async (req, res) => {
            const product = req.body;
            const result = await productsCollection.insertOne(product);
            res.send(result);
        });

        app.put('/products', async (req, res) => {
            const data = req.body;
            const filter = { _id: ObjectId(data.id) };
            // const options = { upsert: true };
            const updateDoc = { $set: { advertise: !data.advertiseStatus } };
            const result = await productsCollection.updateOne(filter, updateDoc)
            res.json(result);
        });

        app.get('/categoryProducts/:id', async (req, res) => {
            const id = req.params.id;
            const query = {
                product_categoryId: id,
                advertise: true, sales_status: 'available'
            };
            const categoryProducts = await productsCollection.find(query).toArray();
            res.send(categoryProducts);
        });

        //  Products by Advertised section
        app.get('/advertisedProducts', async (req, res) => {
            const query = { advertise: true, sales_status: 'available' };

            const advertisedProducts = await productsCollection.find(query).toArray();
            res.send(advertisedProducts);
        });

        //Reported Products section
        app.get('/reportedProducts', async (req, res) => {
            const query = {};
            const reportedProducts = await reportedProductsCollection.find(query).toArray();
            res.send(reportedProducts);
        });

        app.post('/reportedProducts', async (req, res) => {
            const reportedProduct = req.body;
            console.log(reportedProduct);
            const result = await reportedProductsCollection.insertOne(reportedProduct);
            res.send(result);
        });
        app.delete('/reportedProducts/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await reportedProductsCollection.deleteOne(filter);
            res.send(result)
        })

        //booking product section
        app.get('/bookingProducts/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const bookingProducts = await bookingProductsCollection.find(query).toArray();
            res.send(bookingProducts);
        });

        app.get('/bookingProducts/pay/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const bookingProduct = await bookingProductsCollection.findOne(query);
            res.send(bookingProduct);
        });

        app.post('/bookingProducts', async (req, res) => {
            const bookingProduct = req.body;
            console.log(bookingProduct);
            const result = await bookingProductsCollection.insertOne(bookingProduct);
            res.send(result);
        });
        // app.delete('/bookingProducts/:id', verifyJWT, verifyAdmin, async (req, res) => {
        //     const id = req.params.id;
        //     const filter = { _id: ObjectId(id) };
        //     const result = await bookingProductsCollection.deleteOne(filter);
        //     res.send(result)
        // })

        // payment section
        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id1 = payment.bookingId
            const id2 = payment.productId
            const filter1 = { _id: ObjectId(id1) }
            const filter2 = { _id: ObjectId(id2) }
            const updatedDoc1 = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedDoc2 = {
                $set: {
                    sales_status: 'sold'
                }
            }
            const updatedResult1 = await bookingProductsCollection.updateOne(filter1, updatedDoc1)
            const updatedResult2 = await productsCollection.updateOne(filter2, updatedDoc2)
            res.send(result);
        })

    }
    finally {

    }
}
run().catch(console.log);

app.get('/', async (req, res) => {
    res.send('LapSell Corner server is running');
});

app.listen(port, () => console.log(`LapSell Corner running on ${port}`));