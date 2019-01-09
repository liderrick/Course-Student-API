const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');

const j = require('../lib/jwt');
const ds = require('../lib/datastore');

const datastore = ds.datastore;
const COURSE = ds.COURSE;
const STUDENT = ds.STUDENT;
const USER = ds.USER;
const PAGINATION_LIMIT = ds.PAGINATION_LIMIT;

const checkJwt = j.checkJwt;

const router = express.Router();
router.use(bodyParser.json());


/* ------------- Begin Login Model Functions ------------- */

function post_user(req, full_name, department, start_date, email){
	var key = datastore.key(USER);
    var new_user = {    "full_name": full_name,
                        "department": department,
                        "start_date": start_date,
                        "email": email,
                        "owner_of_courses": [] };
    return datastore.save({ "key": key, "data": new_user })
    .then( () => {
        new_user = ds.addIDandSelfUserLink(req, new_user, key.id);
        return new_user;
    });
}

/* ------------- End Login Model Functions ------------- */

/* ------------- Begin Login Controller Functions ------------- */

router.post('/', function(req, res){
    if(req.get('Content-Type') !== 'application/json'){
        res.status(415).send("Server can only accept 'application/json'."); return;
    }
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }

    const username = req.body.username;
    const password = req.body.password;

    var options = {
        method: 'POST',
        url: 'https://<auth0_project_name>.auth0.com/oauth/token',       // TODO: Replace with Auth0 project name
        headers: { 'content-type': 'application/json' },
        body: {
            grant_type: 'password',
            username: username,
            password: password,
            client_id: j.AUTH_CLIENT_ID,
            client_secret: j.AUTH_CLIENT_SECRET
        },
        json: true
    };

    request(options, (error, response, body) => {
        if (error){
            res.status(500).send(error);
        } else {
            if (body.hasOwnProperty("id_token")) {
                res.status(200).send(body);
            } else {
                res.status(400).send(body);
            }
        }
    });
});

router.post('/signup', function(req, res){
    if(req.get('Content-Type') !== 'application/json'){
        res.status(415).send("Server can only accept 'application/json'."); return;
    }
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }

    const email = req.body.email;
    const password = req.body.password;
    const full_name = req.body.full_name;
    const department = req.body.department;
    const start_date = req.body.start_date;

    if(!email || !password || !full_name || !department || !start_date) {
    	res.status(400).send("The following properties are required: email, password, full_name, department, and start_date."); return;
    }

    var options = {
        method: 'POST',
        url: 'https://<auth0_project_name>.auth0.com/dbconnections/signup',         // TODO: Replace with Auth0 project name
        headers: { 'content-type': 'application/json' },
        body: {
            connection: 'Username-Password-Authentication',
            email: email,
            password: password,
            client_id: j.AUTH_CLIENT_ID
        },
        json: true
    };

    request(options, (error, response, body) => {
        if (error){
            res.status(500).send(error);
        } else {
            if (body.hasOwnProperty("email")) {
            	post_user(req, full_name, department, start_date, email)
            	.then( (new_user) => {
		            res.location(new_user.self);
            		res.status(201).json(new_user);
            	});
            } else {
                res.status(400).send(body);
            }
        }
    });
});

router.get('/', function(req, res) {
    res.set("Allow", "POST");
    res.status(405).end();
});

router.put('/', function(req, res) {
    res.set("Allow", "POST");
    res.status(405).end();
});

router.delete('/', function(req, res) {
    res.set("Allow", "POST");
    res.status(405).end();
});

router.get('/signup', function(req, res) {
    res.set("Allow", "POST");
    res.status(405).end();
});

router.put('/signup', function(req, res) {
    res.set("Allow", "POST");
    res.status(405).end();
});

router.delete('/signup', function(req, res) {
    res.set("Allow", "POST");
    res.status(405).end();
});

/* ------------- End Login Controller Functions ------------- */

module.exports = router;