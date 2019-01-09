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


/* ------------- Begin User Model Functions ------------- */

function get_user(req, email) {
	var q_user = datastore.createQuery(USER).filter('email', '=', email);
    return datastore.runQuery(q_user).then( async (user_entities) => {
    	if (user_entities[0].length === 0) { throw "That user does not exist."; }
		if (user_entities[0][0].email !== req.user.name) { throw "You do not have the authorization to view that user."; }
        var user = user_entities[0][0];

        // Get course_number and course_title
        var course_keys = user.owner_of_courses.map( (owned_course) => {
            return datastore.key([COURSE, parseInt(owned_course.id, 10)]);
        });
        for (var i in course_keys) {
            await datastore.get(course_keys[i]).then( async (course_entities) => {
                var course = course_entities[0];
                user.owner_of_courses[i].course_number = course.course_number;
                user.owner_of_courses[i].course_title = course.course_title;
            });
        }

        user = ds.addIDandSelfUserLink(req, user, user[ds.Datastore.KEY].id);
        user.owner_of_courses = user.owner_of_courses.map(ds.addCourseLinkWrapper(req));
        return user;
    });
}

function put_user(req, email, full_name, department, start_date){
	var q_user = datastore.createQuery(USER).filter('email', '=', email);
    return datastore.runQuery(q_user).then( (user_entities) => {
    	if (user_entities[0].length === 0) { throw "That user does not exist."; }
		if (user_entities[0][0].email !== req.user.name) { throw "You do not have the authorization to edit that user."; }
        var user = user_entities[0][0];
	    var updated_user = {	"full_name": full_name,
	                        	"department": department,
	                        	"start_date": start_date,
	                        	"email": email,
	                        	"owner_of_courses": user.owner_of_courses };
	    return datastore.update({ "key": user[ds.Datastore.KEY], "data": updated_user })
	    .then( async () => {

	    	// Get course_number and course_title
	        var course_keys = updated_user.owner_of_courses.map( (owned_course) => {
	            return datastore.key([COURSE, parseInt(owned_course.id, 10)]);
	        });
	        for (var i in course_keys) {
	            await datastore.get(course_keys[i]).then( async (course_entities) => {
	                var course = course_entities[0];
	                updated_user.owner_of_courses[i].course_number = course.course_number;
	                updated_user.owner_of_courses[i].course_title = course.course_title;
	            });
	        }

	        updated_user = ds.addIDandSelfUserLink(req, updated_user, user[ds.Datastore.KEY].id);
        	updated_user.owner_of_courses = updated_user.owner_of_courses.map(ds.addCourseLinkWrapper(req));
        	return updated_user;
	    });
    });
}

function delete_user(req, email) {
	var q_user = datastore.createQuery(USER).filter('email', '=', email);
    return datastore.runQuery(q_user).then( async (user_entities) => {
    	if (user_entities[0].length === 0) { throw "That user does not exist."; }
		if (user_entities[0][0].email !== req.user.name) { throw "You do not have the authorization to delete that user."; }

		// Delete user from Auth0
	    var context = {};
	    context.email = email;
	    await getManagementApiToken(context).catch( (err) => { return err; });
	    await getAuth0UserId(context).catch( (err) => { return err; });
	    await deleteUserWithManagementApi(context).catch( (err) => { return err; });

	    // Delete user from Google Datastore
        // For each of user's course, remove course from students' schedule_of_courses, then delete course.
		var user = user_entities[0][0];
        var course_keys = user.owner_of_courses.map( (owned_course) => {
            return datastore.key([COURSE, parseInt(owned_course.id, 10)]);
        });
        for (let c_key of course_keys) {
            await datastore.get(c_key).then( async (course_entities) => {
                var course = course_entities[0];
                var course_id = course[ds.Datastore.KEY].id;

		        // Remove course from students' schedule_of_courses
		        var student_keys = course.enrolled_students.map( (enrolled_student) => {
		            return datastore.key([STUDENT, parseInt(enrolled_student.id, 10)]);
		        });
		        for (let s_key of student_keys) {
		            await datastore.get(s_key).then( async (student_entities) => {
		                var student = student_entities[0];
		                var updated_schedule_of_courses = student.schedule_of_courses.filter( (value) => {
		                    return value.id.toString() !== course_id.toString();
		                });
		                var updated_student = { "full_name": student.full_name,
		                                        "graduation_year": student.graduation_year,
		                                        "major": student.major,
		                                        "schedule_of_courses": updated_schedule_of_courses  };
		                await datastore.update({ "key": s_key, "data": updated_student });
		            });
		        }

		        await datastore.delete(c_key);
            });
        }
	    return datastore.delete(user[ds.Datastore.KEY]);
    });
}

var getManagementApiToken = (context) => {
	return new Promise( (resolve, reject) => {

		var options = {
			method: 'POST',
			url: 'https://<auth0_project_name>.auth0.com/oauth/token',			// TODO: Replace with Auth0 project name
			headers: { 'content-type': 'application/json' },
			body: {
				client_id: j.MGMT_CLIENT_ID,
				client_secret: j.MGMT_CLIENT_SECRET,
				audience: "https://<auth0_project_name>.auth0.com/api/v2/",		// TODO: Replace with Auth0 project name
				grant_type: 'client_credentials'},
			json: true
		};

		request(options, (error, response, body) => {
		  	if (error){
	            reject(Promise.reject("Internal Error: Error getting API access token."));
	        } else {
	        	if ('access_token' in body) {
					context.access_token = body.access_token;	// Save access_token in response body
					resolve(context);
	        	} else {
	        		reject(Promise.reject("Internal Error: Error getting API access token."));
	        	}
	        }
	    });
	});
}

var getAuth0UserId = (context) => {
	return new Promise( (resolve, reject) => {

		var bearerToken = "Bearer " + context.access_token;		// Assemble Bearer Token to use in API Call
		var querystring = "?email=" + context.email;

		var options = {
			method: 'GET',
			url: 'https://<auth0_project_name>.auth0.com/api/v2/users-by-email' + querystring,		// TODO: Replace with Auth0 project name
			headers: { authorization: bearerToken },
			json: true
		};

		request(options, (error, response, body) => {
		  	if (error){
	            reject(Promise.reject("Internal Error: Error getting Auth0 user_id from email."));
	        } else {
	        	if (response.statusCode != 200 || body.length == 0) {
	        		reject(Promise.reject("Internal Error: Error getting Auth0 user_id from email."));
	        	} else {
		        	context.user_id = body[0].user_id;	// Save user_id
		        	resolve(context);
	        	}
	        }
	    });
	});
}

var deleteUserWithManagementApi = (context) => {
	return new Promise( (resolve, reject) => {

		var bearerToken = "Bearer " + context.access_token;		// Assemble Bearer Token to use in API Call

		var options = {
			method: 'DELETE',
			url: 'https://<auth0_project_name>.auth0.com/api/v2/users/' + context.user_id,		// TODO: Replace with Auth0 project name
			headers: { authorization: bearerToken },
			json: true
		};

		request(options, (error, response, body) => {
		  	if (error){
	            reject(Promise.reject("Internal Error: Error deleting user from Auth0."));
	        } else {
	        	if (response.statusCode != 204) {
	        		reject(Promise.reject("Internal Error: Error deleting user from Auth0."));
	        	} else {
		        	resolve(context);
	        	}
	        }
	    });
	});
}

/* ------------- End User Model Functions ------------- */

/* ------------- Begin User Controller Functions ------------- */

router.get('/:email', checkJwt, function(req, res) {
    console.log("GET user:", req.params.email);
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
	    get_user(req, req.params.email)
	    .then( (user) => {
	        res.status(200).json(user);
	    }, (err) => {
	        if (err === "That user does not exist.") {
	            res.status(404).send(err);
            } else if (err === "You do not have the authorization to view that user.") {
                res.status(403).send(err);
	        } else {
	            res.status(400).send(err);
	        }
	    });
    }
});

router.put('/:email', checkJwt, function(req, res){
    console.log("PUT user: email = " + req.params.email + ",", req.body);
    if(req.get('Content-Type') !== 'application/json'){
        res.status(415).send("Server can only accept 'application/json'."); return;
    }
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }

    if(!req.body.full_name || !req.body.department || !req.body.start_date) {
    	res.status(400).send("The following properties are required: full_name, department, and start_date."); return;
    }
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        put_user(req, req.params.email, req.body.full_name, req.body.department, req.body.start_date)
        .then( (updated_user) => {
            res.location(updated_user.self);
            res.status(200).json(updated_user);
        }, (err) => {
	        if (err === "That user does not exist.") {
	            res.status(404).send(err);
            } else if (err === "You do not have the authorization to edit that user.") {
                res.status(403).send(err);
	        } else {
	            res.status(400).send(err);
	        }
        });
    }
});

router.delete('/:email', checkJwt, function(req, res) {
    console.log("DELETE user:", req.params.email);
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        delete_user(req, req.params.email)
        .then( () => {
            res.status(204).end();
        }, (err) => {
            if (err === "That user does not exist.") {
                res.status(404).send(err);
            } else if (err === "You do not have the authorization to delete that user.") {
                res.status(403).send(err);
            } else if (err === "Internal Error: Error getting API access token." ||
            			err === "Internal Error: Error getting Auth0 user_id from email." ||
            			err === "Internal Error: Error deleting user from Auth0.") {
                res.status(500).send(err);
            } else {
                res.status(400).send(err);
            }
        });
    }
});

router.post('/', function(req, res) {
    res.set("Allow", "None");
    res.status(405).end();
});

router.get('/', function(req, res) {
    res.set("Allow", "None");
    res.status(405).end();
});

router.put('/', function(req, res) {
    res.set("Allow", "None");
    res.status(405).end();
});

router.delete('/', function(req, res) {
    res.set("Allow", "None");
    res.status(405).end();
});

router.post('/:email', function(req, res) {
    res.set("Allow", "GET, PUT, DELETE");
    res.status(405).end();
});

/* ------------- End User Controller Functions ------------- */

module.exports = router;