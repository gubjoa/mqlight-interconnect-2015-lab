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

var SUBSCRIBE_TOPIC = "mqlight/sample/words";
	
var PUBLISH_TOPIC = "mqlight/sample/wordsuppercase";

var SHARE_ID = "node-back-end";

var mqlightServiceName = "mqlight";
var messageHubServiceName = 'messagehub';
	
var mqlight = require('mqlight');

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
 * Create our MQ Light client
 * If we are not running in Bluemix, then default to a local MQ Light connection  
 */
var mqlightSubInitialised = false;
var mqlightClient = mqlight.createClient(opts, function(err) {
		if (err) {
			console.error('Connection to ' + opts.service + ' using client-id ' + mqlightClient.id + ' failed: ' + err);
		}
		else {
			console.log('Connected to ' + opts.service + ' using client-id ' + mqlightClient.id);
		}
		/*
		 * Create our subscription
		 */
		mqlightClient.on('message', processMessage);
		mqlightClient.subscribe(SUBSCRIBE_TOPIC, SHARE_ID, 
				{credit : 5,
			     autoConfirm : true,
			     qos : 0}, function(err) {
			    	 if (err) console.err("Failed to subscribe: " + err); 
			    	 else {
			    		 console.log("Subscribed");
			    		 mqlightSubInitialised = true;
			    	 }
			     });
	});

/*
 * Handle each message as it arrives
 */
function processMessage(data, delivery) {
	var word = data.word;
	try {
		// Convert JSON into an Object we can work with 
		data = JSON.parse(data);
		word = data.word;
	} catch (e) {
		// Expected if we already have a Javascript object
	}
	if (!word) {
		console.error("Bad data received: " + data);
	}
	else {
		console.log("Received data: " + JSON.stringify(data));
		// Upper case it and publish a notification
		var replyData = {
				"word" : word.toUpperCase(),
				"backend" : "Node.js: " + mqlightClient.id
		};
		// Convert to JSON to give the same behaviour as Java
		// We could leave as an Object, but this is better for interop
		replyData = JSON.stringify(replyData);
		console.log("Sending response: " + replyData);
		mqlightClient.send(PUBLISH_TOPIC, replyData);
	}
}
