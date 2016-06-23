/*******************************************************************************
 * Copyright (c) 2014 IBM Corporation and other Contributors.
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html 
 *
 * Contributors:
 * IBM - Initial Contribution
 *******************************************************************************/

var PUBLISH_TOPIC = "mqlight/sample/words";
	
var SUBSCRIBE_TOPIC = "mqlight/sample/wordsuppercase";

var SHARE_ID = "node-front-end";

var mqlightServiceName = "mqlight";
var messageHubServiceName = 'messagehub';

var http = require('http');
var express = require('express');
var fs = require('fs');
var mqlight = require('mqlight');
var bodyParser = require('body-parser');

/*
 * Establish MQ credentials
 */
var opts = {};
var mqlightService = {};
if (process.env.VCAP_SERVICES) {
	var services = JSON.parse(process.env.VCAP_SERVICES);
	console.log('Running BlueMix');
	for (var key in services) {
		if (key.lastIndexOf(mqlightServiceName, 0) === 0) {
			mqlightService = services[key][0];
			opts.service = mqlightService.credentials.nonTLSConnectionLookupURI;
			opts.user = mqlightService.credentials.username;
			opts.password = mqlightService.credentials.password;
		} else if (key.lastIndexOf(messageHubServiceName, 0) === 0) {
			messageHubService = services[key][0];
			opts.service = messageHubService.credentials.mqlight_lookup_url;
			opts.user = messageHubService.credentials.user;
			opts.password = messageHubService.credentials.password;
		}
	}
	if (!opts.hasOwnProperty('service') ||
	    !opts.hasOwnProperty('user') ||
	    !opts.hasOwnProperty('password')) {
		throw 'Error - Check that app is bound to service';
	}
} else {
	opts.service = 'amqp://localhost:5672';
}

/*
 * Establish HTTP credentials, then configure Express
 */
var httpOpts = {};
httpOpts.port = (process.env.VCAP_APP_PORT || 3000);

var app = express();



/*
 * Create our MQ Light client
 * If we are not running in Bluemix, then default to a local MQ Light connection  
 */
var mqlightSubInitialised = false;
var mqlightClient = mqlight.createClient(opts, function(err) {
	if (err) {
		console.error('Connection to ' + opts.service + ' using client-id ' + mqlightClient.id + ' failed: ' + err);
	} else {
		console.log('Connected to ' + opts.service + ' using client-id ' + mqlightClient.id);
	}
	/*
	 * Create our subscription
	 */
	mqlightClient.on('message', processMessage);
	mqlightClient.subscribe(SUBSCRIBE_TOPIC, SHARE_ID, 
		{credit : 1,
			autoConfirm : false,
			qos : 1}, function(err) {
				if (err) console.err("Failed to subscribe: " + err); 
				else {
					console.log("Subscribed");
					mqlightSubInitialised = true;
				}
			});
});

/*
 * Store a maximum of one message from the MQ Light server, for the browser to poll. 
 * The polling GET REST handler does the confirm
 */
var heldMsg;
function processMessage(data, delivery) {
	try {
		data = JSON.parse(data);
		console.log("Received response: " + JSON.stringify(data));
	} catch (e) {
		// Expected if we're receiving a Javascript object
	}
	heldMsg = {"data" : data, "delivery" : delivery};
}

/*
 * Add static HTTP content handling
 */
function staticContentHandler(req,res) {
  var url = req.url.substr(1);
  if (url == '') { url = __dirname + '/index.html';};
  if (url == 'style.css') {res.contentType('text/css');}
  fs.readFile(url,
	function (err, data) {
		if (err) {
			res.writeHead(404);
			return res.end('Not found');
		}
		res.writeHead(200);
		return res.end(data);
	});
}
app.all('/', staticContentHandler);
app.all('/*.html', staticContentHandler);
app.all('/*.css', staticContentHandler);
app.all('/images/*', staticContentHandler);

/*
 * Use JSON for our REST payloads
 */
app.use(bodyParser.json());

/*
 * POST handler to publish words to our topic
 */
app.post('/rest/words', function(req,res) {
	// Check we've initialised our subscription
	if (!mqlightSubInitialised) {
		res.writeHead(500);
		return res.end('Connection to MQ Light not initialised');
	}
	
	// Check they've sent { "words" : "Some Sentence" }
	if (!req.body.words) {
		res.writeHead(500);
		return res.end('No words');
	}
	// Split it up into words
	var msgCount = 0; 
	req.body.words.split(" ").forEach(function(word) {
		// Send it as a message
		var msgData = {
			"word" : word,
			"frontend" : "Node.js: " + mqlightClient.id
		};
		console.log("Sending message: " + JSON.stringify(msgData));
		mqlightClient.send(PUBLISH_TOPIC, msgData);
		msgCount++; 
	});
	// Send back a count of messages sent
	res.json({"msgCount" : msgCount});
});

/*
 * GET handler to poll for notifications
 */
app.get('/rest/wordsuppercase', function(req,res) {
	// Do we have a message held?
	var msg = heldMsg;
	if (msg) {
		// Let the next message stream down from MQ Light
		heldMsg = null;
		msg.delivery.message.confirmDelivery();
		// Send the data to the caller
		res.json(msg.data);
	}
	else {
		// Just return no-data
		res.writeHead(204);
		res.end();
	}
});

/*
 * Start our REST server
 */
if (httpOpts.host) {
	http.createServer(app).listen(httpOpts.host, httpOpts.port, function () {
		console.log('App listening on ' + httpOpts.host + ':' + httpOpts.port);
	});
}
else {
	http.createServer(app).listen(httpOpts.port, function () {
		console.log('App listening on *:' + httpOpts.port);
	});
}
