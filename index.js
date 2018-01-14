
let express = require("express");
let bodyParser = require("body-parser"); 
let cron = require("node-cron"); 
let fs = require("fs"); 
let https = require('https');
let config = require("./config.json");
let mongoose = require("mongoose");
let cors = require("cors");


let app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded(
    { extended: true }
));


let apiURL = "newsapi.org";
let newsSources = ["abc-news", "bbc-news", "bbc-sport", "espn", "business-insider", "buzzfeed", "cnbc", "cnn"];

function getLastDate() {
    let configFile = fs.readFileSync("config.json");
    configFile = JSON.parse(configFile);
    return configFile.updatedOn;
}

let mongoDB = "mongodb://127.0.0.1:27017/newsfeed";
mongoose.connect(mongoDB, { usemongoclient: true });
mongoose.Promise = global.Promise;
let db = mongoose.connection;
db.on("error", console.error.bind(console, 'MongoDB Connection Error: '));
 

let Schema = mongoose.Schema;

let NewsFeedSchema = new Schema({
    source: {
        id: String,
        name: String
    },
    author: String,
    title: String,
    description: String,
    url: String,
    urlToImage: String,
    publishedAt: String
});

let NewsFeedModel = mongoose.model('NewsFeedModel', NewsFeedSchema);


function getNewsFeed(options) {
    console.log(options);
    let req = https.get(options, (response) => {
        let bodyChunks = [];
        response.on('data', (chunk) => {
            bodyChunks.push(chunk);
        }).on('end', () => {
            let body = Buffer.concat(bodyChunks);
            let data = JSON.parse(body);

           
            let date = new Date()
            date.setHours(date.getHours() + 5);
            date.setMinutes(date.getMinutes() + 30);
            config.updatedOn = date.toISOString();

            
            fs.writeFileSync("config.json", JSON.stringify(config, null, 2), (err) => {
                if (err) {
                    return console.log(err);
                }
            });

            console.log(data.articles);


            
            data.articles.forEach(newsFeedItem => {
                let NewsFeedInstance = new NewsFeedModel(newsFeedItem);
                NewsFeedInstance.save((err) => {
                    if (err) {
                        throw err;
                    }
                });
            });

            console.log(data.articles.length + " records added");
        })
    });

    req.on('error', (err) => {
        console.log('ERROR: ' + err.message);
    });
}

let newsFetchJob = cron.schedule('*/10 * * * * *', () => {
    console.log("Job Started.")
    console.log("Last Run Date : " + getLastDate());
    let reqOptions = {
        host: apiURL,
        method: 'GET',
        path: "/v2/everything?sources=" + newsSources.join() + "&from=" + getLastDate() + "&apiKey=" + config.apiKey +"&sortby"
    }

    getNewsFeed(reqOptions);
}, false);

newsFetchJob.start();

app.get("/news", (req, res) => {
    console.log("News API got a hit");
    NewsFeedModel.find({}, (err, NewsFeed) => {
        res.json(NewsFeed);
        res.end();
    }).sort({publishedAt:-1});
}); 
app.post("/search", (req, res) => {
    let q = req.param("keyword");
    NewsFeedModel.find(
        {
            'title': new RegExp(q, "i"),  // works as LIKE clause of SQL
            'source.id': { $in: req.param("sources") } //works as IN clause of SQL
        }
        , (err, NewsFeed) => {
            res.json(NewsFeed);
            res.end();
        });
});

app.listen(8080, () => {
    console.log('Server started at http://localhost:8080/');
});