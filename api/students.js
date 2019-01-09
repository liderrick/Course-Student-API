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

/* ------------- Begin Student Model Functions ------------- */

function post_student(req, full_name, graduation_year, major){
    graduation_year = parseInt(graduation_year, 10);
    if(isNaN(graduation_year) || graduation_year < 0) { return Promise.reject("\'graduation_year\' field does not contain a valid value."); }
    var key = datastore.key(STUDENT);
    var new_student = {	"full_name": full_name,
                        "graduation_year": graduation_year,
                        "major": major,
                        "schedule_of_courses": [] };

    return datastore.save({ "key": key, "data": new_student })
    .then( () => {
        new_student = ds.addIDandSelfLink(req, new_student, key.id);
        return new_student;
    });
}

async function get_students(req) {
    // Get student count
    var total_student_count;
    var q_student_count = datastore.createQuery(STUDENT);
    await datastore.runQuery(q_student_count).then( (student_entities) => {
        total_student_count = student_entities[0].length;
    });

    var q_student = datastore.createQuery(STUDENT).limit(PAGINATION_LIMIT);
    if(Object.keys(req.query).includes("cursor")) {
        q_student = q_student.start(req.query.cursor);
    }
    const results = {};

    return datastore.runQuery(q_student).then( (student_entities) => {
        results.total_student_count = total_student_count;
        results.students = student_entities[0].map(ds.addIDandSelfLinkandCourseCountandRemoveScheduleOfCoursesWrapper(req));

        if(student_entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ) {
            results.next = ds.getProtocol(req) + "://" + req.get("host") + req.baseUrl + "?cursor=" + student_entities[1].endCursor;
        }
        return results;
    });
}

function get_student(req, student_id) {
    student_id = parseInt(student_id, 10);
    if(isNaN(student_id)) { return Promise.reject("Invalid student id supplied."); }
    const key = datastore.key([STUDENT, student_id]);
    return datastore.get(key).then( async (student_entities) => {
        if (student_entities[0] === undefined) { throw "That student does not exist."; };
        var student = student_entities[0];

        // Get course_number and course_title
        var course_keys = student.schedule_of_courses.map( (scheduled_course) => {
            return datastore.key([COURSE, parseInt(scheduled_course.id, 10)]);
        });
        for (var i in course_keys) {
            await datastore.get(course_keys[i]).then( async (course_entities) => {
                var course = course_entities[0];
                student.schedule_of_courses[i].course_number = course.course_number;
                student.schedule_of_courses[i].course_title = course.course_title;
            });
        }

        student.schedule_of_courses = student.schedule_of_courses.map(ds.addCourseLinkWrapper(req));
        student = ds.addIDandSelfLink(req, student, student_id);
        return student;
    });
}

function put_student(req, student_id, full_name, graduation_year, major){
    student_id = parseInt(student_id, 10);
    if(isNaN(student_id)) { return Promise.reject("Invalid student id supplied."); }
    graduation_year = parseInt(graduation_year, 10);
    if(isNaN(graduation_year) || graduation_year < 0) { return Promise.reject("\'graduation_year\' field does not contain a valid value."); }

    var student_key = datastore.key([STUDENT, student_id]);
    return datastore.get(student_key)
    .then( async (student_entities) => {
        if (student_entities[0] === undefined) { throw "That student does not exist."; }
        var student = student_entities[0];
        var updated_student = { "full_name": full_name,
                                "graduation_year": graduation_year,
                                "major": major,
                                "schedule_of_courses": student.schedule_of_courses };
        return datastore.update({ "key": student_key, "data": updated_student })
        .then( async () => {

            // Get course_number and course_title
            var course_keys = updated_student.schedule_of_courses.map( (scheduled_course) => {
                return datastore.key([COURSE, parseInt(scheduled_course.id, 10)]);
            });
            for (var i in course_keys) {
                await datastore.get(course_keys[i]).then( async (course_entities) => {
                    var course = course_entities[0];
                    updated_student.schedule_of_courses[i].course_number = course.course_number;
                    updated_student.schedule_of_courses[i].course_title = course.course_title;
                });
            }

            updated_student.schedule_of_courses = updated_student.schedule_of_courses.map(ds.addCourseLinkWrapper(req));
            updated_student = ds.addIDandSelfLink(req, updated_student, student_id);
            return updated_student;
        });
    });
}

function delete_student(req, student_id) {
    student_id = parseInt(student_id, 10);
    if(isNaN(student_id)) { return Promise.reject("Invalid student id supplied."); }
    var student_key = datastore.key([STUDENT, student_id]);
    return datastore.get(student_key)
    .then( async (student_entities) => {
        if (student_entities[0] === undefined) { throw "That student does not exist."; }
        var student = student_entities[0];

        // Remove student from courses' enrolled_students
        var course_keys = student.schedule_of_courses.map( (scheduled_course) => {
            return datastore.key([COURSE, parseInt( scheduled_course.id, 10)]);
        });
        for (let c_key of course_keys) {
            await datastore.get(c_key).then( async (course_entities) => {
                var course = course_entities[0];
                var updated_enrolled_students = course.enrolled_students.filter( (value) => {
                    return value.id.toString() !== student_id.toString()
                });

                var updated_course = {  "course_number": course.course_number,
                                        "credits": course.credits,
                                        "course_title": course.course_title,
                                        "course_owner": { "email": course.course_owner.email},
                                        "enrolled_students": updated_enrolled_students };
                await datastore.update({ "key": c_key, "data": updated_course });
            });
        }

        return datastore.delete(student_key);
    });
}


/* ------------- End Student Model Functions ------------- */

/* ------------- Begin Student Controller Functions ------------- */

router.post('/', checkJwt, function(req, res) {
    console.log("POST student:", req.body);
    if(req.get('Content-Type') !== 'application/json'){
        res.status(415).send("Server can only accept 'application/json'."); return;
    }
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }
    if(!req.body.full_name || !req.body.graduation_year || !req.body.major) {
        res.status(400).send("The following properties are required: full_name, graduation_year, and major."); return;
    }
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        post_student(req, req.body.full_name, req.body.graduation_year, req.body.major)
        .then( (new_student) => {
            res.location(new_student.self);
            res.status(201).json(new_student);
        }, (err) => {
            res.status(400).send(err);
        });
    }
});

router.get('/', function(req, res) {
    console.log("GET students.");
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }
    get_students(req)
    .then( (students) => {
        res.status(200).json(students);
    }, (err) => {
        res.status(400).end();
    });
});

router.get('/:id', function(req, res) {
    console.log("GET student:", req.params.id);
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }
    get_student(req, req.params.id)
    .then( (student) => {
        res.status(200).json(student);
    }, (err) => {
        if (err === "That student does not exist.") {
            res.status(404).send(err);
        } else {
            res.status(400).send(err);
        }
    });
});

router.put('/:id', checkJwt, function(req, res){
    console.log("PUT student: id = " + req.params.id + ",", req.body);
    if(req.get('Content-Type') !== 'application/json'){
        res.status(415).send("Server can only accept 'application/json'."); return;
    }
    if(!req.accepts('application/json')) {
        res.status(406).send("Server can only return 'application/json'."); return;
    }
    if(!req.body.full_name || !req.body.graduation_year || !req.body.major) {
        res.status(400).send("The following properties are required: full_name, graduation_year, and major."); return;
    }
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        put_student(req, req.params.id, req.body.full_name, req.body.graduation_year, req.body.major)
        .then( (updated_student) => {
            res.location(updated_student.self);
            res.status(200).json(updated_student);
        }, (err) => {
            if (err === "That student does not exist.") {
                res.status(404).send(err);
            } else {
                res.status(400).send(err);
            }
        });
    }
});

router.delete('/:id', checkJwt, function(req, res){
    console.log("DELETE student:", req.params.id);
    if(req.user === undefined) {
        res.status(401).send("JWT required in authorization header.");
    } else {
        delete_student(req, req.params.id)
        .then( () => {
            res.status(204).end();
        }, (err) => {
            if (err === "That student does not exist.") {
                res.status(404).send(err);
            } else {
                res.status(400).send(err);
            }
        });
    }
});


router.put('/', function(req, res) {
    res.set("Allow", "GET, POST");
    res.status(405).end();
});

router.delete('/', function(req, res) {
    res.set("Allow", "GET, POST");
    res.status(405).end();
});

router.post('/:id', function(req, res) {
    res.set("Allow", "GET, PUT, DELETE");
    res.status(405).end();
});

/* ------------- End Student Controller Functions ------------- */

module.exports = router;