/**
 * Packages to be used
 */
let express = require("express");
let bodyParser = require("body-parser"); //To read the data from GET/POST request
let cron = require("node-cron"); //For scheduling tasks
let fs = require("fs"); //File Stream (used to read, write, delete files on server file system)
let https = require('https');
let config = require("./config.json");
let mongoose = require("mongoose");

/**
 * Server Config
 */
let app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded(
    { extended: true }
));

/**
 * Misc. Initializations
 */
let lockFile = "cron.lock";

/**
 * API Config
 */
let apiURL = "newsapi.org";
let newsSources = ["abc-news", "bbc-news", "bbc-sport", "espn", "business-insider", "buzzfeed", "cnbc", "cnn"];

function getLastDate() {
    let configFile = fs.readFileSync("config.json");
    configFile = JSON.parse(configFile);
    return configFile.updatedOn;
}

/**
 * MongoDB config
 */
let mongoDB = "mongodb://127.0.0.1:27017/newsfeed";
mongoose.connect(mongoDB, { usemongoclient: true });
mongoose.Promise = global.Promise;
let db = mongoose.connection;
db.on("error", console.error.bind(console, 'MongoDB Connection Error: '));

/**
 * Schema for News Feed Document
 */
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

/**
 * Gets the News Feed from URL
 * @param {*} options : API Options
 * @param {*} callback : Returns the news JSON array
 */
function getNewsFeed(options, callback) {
    console.log(options);
    let req = https.get(options, (response) => {
        let bodyChunks = [];
        response.on('data', (chunk) => {
            bodyChunks.push(chunk);
        }).on('end', () => {
            let body = Buffer.concat(bodyChunks);
            let data = JSON.parse(body);
            return callback(data.articles);
        })
    });

    req.on('error', (err) => {
        console.log('ERROR: ' + err.message);
    });
}

let newsFetchJob = cron.schedule('*/10 * * * * *', () => {
    if (!fs.existsSync(lockFile)) {
        fs.writeFileSync(lockFile);
        console.log("Job Started.")
        console.log("Last Run Date : " + getLastDate());
        let reqOptions = {
            host: apiURL,
            method: 'GET',
            path: "/v2/everything?sources=" + newsSources.join() + "&from=" + getLastDate() + "&apiKey=" + config.apiKey
        }
        getNewsFeed(reqOptions, (data) => {
            //Set the date marker
            let date = new Date();
            date.setHours(date.getHours() + 5);
            date.setMinutes(date.getMinutes() + 30);
            config.updatedOn = date.toISOString();

            //Update date marker in config.json
            fs.writeFileSync("config.json", JSON.stringify(config, null, 2), (err) => {
                if (err) {
                    return console.log(err);
                }
            });

            //Insert data in MongoDB
            data.forEach(newsFeedItem => {
                let NewsFeedInstance = new NewsFeedModel(newsFeedItem);
                NewsFeedInstance.save((err) => {
                    if (err) {
                        throw err;
                    }
                });
            });

            console.log(data.length + " records added");
            fs.unlinkSync(lockFile);
            console.log("File Deleted");
        });
    }
}, false);

newsFetchJob.start();

app.get("/", (req, res) => {
    NewsFeedModel.find({}, (err, NewsFeed) => {
        res.json(NewsFeed);
        res.end();
    });
});
app.get("/news", (req, res) => {

});

app.listen(8080, () => {
    console.log('Server started');
    if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
    };
});